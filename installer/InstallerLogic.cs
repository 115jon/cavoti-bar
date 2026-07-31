using Microsoft.Win32;
using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;

namespace CavotiInstaller
{
    internal static class InstallerLogic
    {
        private const string DisplayName = "Cavoti Bar";
        internal const string ExecutableName = "Cavoti Bar.exe";
        private const string CurrentProcessName = "Cavoti Bar";
        private const string LegacyProcessName = "cavoti_bar";
        private const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\CavotiBar";
        private static string ProcessStartArguments => "--processStart \"" + ExecutableName + "\"";

        public static void RunInstallation(bool launch)
        {
            var layout = InstallRootLayout.FromLocalAppData();
            StopRunning();
            Directory.CreateDirectory(layout.StagingPath);
            foreach (var directory in Directory.GetDirectories(layout.StagingPath)) TryDelete(directory);
            var staging = Path.Combine(layout.StagingPath, "payload-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(staging);
            ExtractPayload(staging);
            var version = ResolveVersion(Path.Combine(staging, ExecutableName));
            var target = layout.VersionPath(version);
            TryDelete(target);
            Directory.Move(staging, target);
            var previous = InstallState.Load(layout.StatePath);
            new InstallState { CurrentVersion = version, PreviousVersion = previous?.CurrentVersion, ActivatedAtUtc = DateTime.UtcNow.ToString("O") }.Save(layout.StatePath);
            File.Copy(Assembly.GetExecutingAssembly().Location, layout.UpdatePath, true);
            ExtractEmbeddedIcon(layout.RootIconPath);
            DeepLinkRegistration.Register(layout.UpdatePath);
            WriteUninstall(layout);
            CreateShortcut(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Cavoti Bar.lnk"), layout.UpdatePath, ProcessStartArguments);
            CreateShortcut(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.StartMenu), "Programs", "Cavoti Bar.lnk"), layout.UpdatePath, ProcessStartArguments);
            if (launch) LaunchCurrentVersion.Execute(new[] { "--processStart", ExecutableName });
        }

        public static void RunUninstallation()
        {
            var layout = InstallRootLayout.FromLocalAppData();
            StopRunning();
            DeepLinkRegistration.UnregisterIfOwned(layout.UpdatePath);
            Registry.CurrentUser.DeleteSubKeyTree(UninstallKey, false);
            TryDelete(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Cavoti Bar.lnk"));
            TryDelete(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.StartMenu), "Programs", "Cavoti Bar.lnk"));
            ScheduleDirectoryDeletion(layout.RootPath);
        }

        private static void ExtractPayload(string destination)
        {
            var resource = Assembly.GetExecutingAssembly().GetManifestResourceNames().FirstOrDefault(name => name.EndsWith("payload.zip", StringComparison.OrdinalIgnoreCase));
            if (resource == null) throw new InvalidOperationException("Embedded Cavoti payload.zip was not found.");
            using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(resource))
            using (var archive = new ZipArchive(stream, ZipArchiveMode.Read))
                foreach (var entry in archive.Entries)
                {
                    var destinationRoot = Path.GetFullPath(destination).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
                    var path = Path.GetFullPath(Path.Combine(destinationRoot, entry.FullName));
                    if (!path.StartsWith(destinationRoot, StringComparison.OrdinalIgnoreCase))
                        throw new InvalidDataException("The installer payload contains an invalid path.");
                    if (string.IsNullOrEmpty(entry.Name)) Directory.CreateDirectory(path);
                    else { Directory.CreateDirectory(Path.GetDirectoryName(path)); entry.ExtractToFile(path, true); }
                }
            if (!File.Exists(Path.Combine(destination, ExecutableName))) throw new InvalidOperationException("The Cavoti payload is missing " + ExecutableName + ".");
        }

        private static void ExtractEmbeddedIcon(string destination)
        {
            var resource = Assembly.GetExecutingAssembly()
                .GetManifestResourceNames()
                .FirstOrDefault(name => name.EndsWith("icon.ico", StringComparison.OrdinalIgnoreCase));
            if (resource == null) throw new InvalidOperationException("Embedded Cavoti icon was not found.");
            using (var input = Assembly.GetExecutingAssembly().GetManifestResourceStream(resource))
            using (var output = File.Create(destination)) input.CopyTo(output);
        }

        private static string ResolveVersion(string executable) => InstallState.NormalizeVersion(FileVersionInfo.GetVersionInfo(executable).ProductVersion ?? "0.1.0");

        private static void StopRunning()
        {
            foreach (var processName in new[] { CurrentProcessName, LegacyProcessName })
                foreach (var process in Process.GetProcessesByName(processName))
                {
                    try { process.Kill(); process.WaitForExit(5000); }
                    catch { }
                    finally { process.Dispose(); }
                }
        }

        private static void WriteUninstall(InstallRootLayout layout)
        {
            using (var key = Registry.CurrentUser.CreateSubKey(UninstallKey))
            {
                key.SetValue("DisplayName", DisplayName);
                key.SetValue("Publisher", "115jon");
                key.SetValue("InstallLocation", layout.RootPath);
                key.SetValue("DisplayIcon", layout.UpdatePath);
                key.SetValue("UninstallString", "\"" + layout.UpdatePath + "\" --uninstall");
                key.SetValue("QuietUninstallString", "\"" + layout.UpdatePath + "\" --uninstall /S");
            }
        }

        private static void CreateShortcut(string path, string target, string arguments)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            var shell = Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));
            var shortcut = shell.GetType().InvokeMember("CreateShortcut", System.Reflection.BindingFlags.InvokeMethod, null, shell, new object[] { path });
            shortcut.GetType().InvokeMember("TargetPath", System.Reflection.BindingFlags.SetProperty, null, shortcut, new object[] { target });
            shortcut.GetType().InvokeMember("Arguments", System.Reflection.BindingFlags.SetProperty, null, shortcut, new object[] { arguments });
            shortcut.GetType().InvokeMember("WorkingDirectory", System.Reflection.BindingFlags.SetProperty, null, shortcut, new object[] { Path.GetDirectoryName(target) });
            shortcut.GetType().InvokeMember("Save", System.Reflection.BindingFlags.InvokeMethod, null, shortcut, null);
        }

        private static void TryDelete(string path) { try { if (Directory.Exists(path)) Directory.Delete(path, true); else if (File.Exists(path)) File.Delete(path); } catch (Exception error) { InstallerLogger.Error("Cleanup failed: " + path, error); } }

        private static void ScheduleDirectoryDeletion(string path)
        {
            var arguments = "/c timeout /t 2 /nobreak >nul & rmdir /s /q \"" + path + "\"";
            Process.Start(new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = arguments,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
                UseShellExecute = false
            });
        }
    }
}
