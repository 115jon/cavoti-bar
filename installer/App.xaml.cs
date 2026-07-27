using System;
using System.Diagnostics;
using System.Linq;
using System.Windows;
using System.Windows.Threading;

namespace CavotiInstaller
{
    public partial class App : Application
    {
        public static bool IsSilent { get; private set; }
        public static bool IsUninstall { get; private set; }
        public static bool NoLaunch { get; private set; }

        protected override void OnStartup(StartupEventArgs e)
        {
            InstallerLogger.Initialize(e.Args);

            if (LaunchCurrentVersion.IsLaunchRequest(e.Args))
            {
                try
                {
                    LaunchCurrentVersion.Execute(e.Args);
                    Environment.Exit(0);
                }
                catch (Exception error)
                {
                    InstallerLogger.Error("Failed to launch the active Cavoti version.", error);
                    MessageBox.Show(InstallerLogger.AppendLogPath(error.Message), "Cavoti Bar Launch Failed", MessageBoxButton.OK, MessageBoxImage.Error);
                    Environment.Exit(1);
                }
            }

            IsSilent = e.Args.Any(IsSilentArgument);
            IsUninstall = e.Args.Any(IsUninstallArgument);
            NoLaunch = e.Args.Any(arg => arg.Equals("/NoLaunch", StringComparison.OrdinalIgnoreCase) || arg.Equals("--no-launch", StringComparison.OrdinalIgnoreCase));

            DispatcherUnhandledException += (_, args) => InstallerLogger.Error("Installer dispatcher failure.", args.Exception);
            AppDomain.CurrentDomain.UnhandledException += (_, args) => InstallerLogger.Error("Installer domain failure.", args.ExceptionObject as Exception);

            if (IsSilent)
            {
                try
                {
                    if (IsUninstall) InstallerLogic.RunUninstallation();
                    else InstallerLogic.RunInstallation(!NoLaunch);
                    Environment.Exit(0);
                }
                catch (Exception error)
                {
                    InstallerLogger.Error("Silent installer operation failed.", error);
                    Environment.Exit(1);
                }
            }

            base.OnStartup(e);
        }

        private static bool IsSilentArgument(string arg) =>
            arg.Equals("/S", StringComparison.OrdinalIgnoreCase) ||
            arg.Equals("--silent", StringComparison.OrdinalIgnoreCase) ||
            arg.Equals("--passive", StringComparison.OrdinalIgnoreCase);

        private static bool IsUninstallArgument(string arg) =>
            arg.Equals("--uninstall", StringComparison.OrdinalIgnoreCase) ||
            arg.Equals("/uninstall", StringComparison.OrdinalIgnoreCase);

        private static string CurrentProcessPath()
        {
            try { return Process.GetCurrentProcess().MainModule.FileName; }
            catch { return AppDomain.CurrentDomain.BaseDirectory; }
        }
    }
}
