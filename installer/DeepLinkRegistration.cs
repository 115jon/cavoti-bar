using Microsoft.Win32;
using System;
using System.IO;

namespace CavotiInstaller
{
    internal static class DeepLinkRegistration
    {
        private const string Scheme = "cavoti";
        private const string KeyPath = @"Software\Classes\" + Scheme;

        public static void Register(string launcherPath)
        {
            using (var key = Registry.CurrentUser.CreateSubKey(KeyPath))
            {
                key.SetValue(string.Empty, "URL:Cavoti Protocol");
                key.SetValue("URL Protocol", string.Empty);
                using (var icon = key.CreateSubKey("DefaultIcon")) icon.SetValue(string.Empty, launcherPath);
                using (var command = key.CreateSubKey(@"shell\open\command"))
                    command.SetValue(string.Empty, "\"" + launcherPath + "\" --processStart \"" + InstallerLogic.ExecutableName + "\" \"%1\"");
            }
        }

        public static void UnregisterIfOwned(string launcherPath)
        {
            using (var key = Registry.CurrentUser.OpenSubKey(KeyPath))
            using (var command = key?.OpenSubKey(@"shell\open\command"))
            {
                var value = command?.GetValue(string.Empty) as string;
                if (value == null || !value.StartsWith("\"" + Path.GetFullPath(launcherPath) + "\"", StringComparison.OrdinalIgnoreCase)) return;
            }
            Registry.CurrentUser.DeleteSubKeyTree(KeyPath, false);
        }
    }
}
