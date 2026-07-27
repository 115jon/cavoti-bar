using System;
using System.Diagnostics;
using System.IO;
using System.Linq;

namespace CavotiInstaller
{
    internal static class LaunchCurrentVersion
    {
        public static bool IsLaunchRequest(string[] args) =>
            args != null && Array.Exists(args, arg => arg.Equals("--processStart", StringComparison.OrdinalIgnoreCase));

        public static void Execute(string[] args)
        {
            var index = Array.FindIndex(args, arg => arg.Equals("--processStart", StringComparison.OrdinalIgnoreCase));
            if (index < 0 || index + 1 >= args.Length) throw new InvalidOperationException("--processStart requires an executable name.");
            var executable = Path.GetFileName(args[index + 1]);
            var state = InstallState.Load(InstallRootLayout.FromLocalAppData().StatePath);
            if (state == null || string.IsNullOrWhiteSpace(state.CurrentVersion)) throw new InvalidOperationException("Cavoti installation state was not found.");
            var target = Path.Combine(InstallRootLayout.FromLocalAppData().VersionPath(state.CurrentVersion), executable);
            if (!File.Exists(target)) throw new FileNotFoundException("The active Cavoti executable was not found.", target);
            var passthrough = index + 2 < args.Length
                ? string.Join(" ", args.Skip(index + 2).Select(Quote))
                : string.Empty;
            Process.Start(new ProcessStartInfo { FileName = target, Arguments = passthrough, WorkingDirectory = Path.GetDirectoryName(target), UseShellExecute = true });
        }

        private static string Quote(string value) => value.IndexOf(' ') >= 0 ? "\"" + value.Replace("\"", "\\\"") + "\"" : value;
    }
}
