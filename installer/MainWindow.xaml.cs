using System;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Input;

namespace CavotiInstaller
{
    public partial class MainWindow : Window
    {
        public MainWindow()
        {
            InitializeComponent();
            Loaded += MainWindow_Loaded;
        }

        private void MainWindow_Loaded(object sender, RoutedEventArgs e)
        {
            if (App.IsUninstall)
            {
                Status.Text = "Uninstall Cavoti Bar?";
                Details.Text = "This removes the app and shortcuts. Your Cavoti session data is left intact.";
                Details.Visibility = Visibility.Visible;
                Actions.Visibility = Visibility.Visible;
                Progress.Visibility = Visibility.Collapsed;
                return;
            }

            InstallAsync();
        }

        private async void InstallAsync()
        {
            try
            {
                Status.Text = "Installing Cavoti Bar...";
                await Task.Run(() => InstallerLogic.RunInstallation(!App.NoLaunch));
                Status.Text = App.NoLaunch ? "Installation complete" : "Launching Cavoti Bar...";
                await Task.Delay(App.NoLaunch ? 300 : 900);
                Application.Current.Shutdown();
            }
            catch (Exception error)
            {
                InstallerLogger.Error("Interactive installation failed.", error);
                Status.Text = "Installation failed";
                Details.Text = InstallerLogger.AppendLogPath(error.Message);
                Details.Visibility = Visibility.Visible;
                Progress.Visibility = Visibility.Collapsed;
            }
        }

        private async void Confirm_Click(object sender, RoutedEventArgs e)
        {
            Actions.Visibility = Visibility.Collapsed;
            Progress.Visibility = Visibility.Visible;
            Status.Text = "Uninstalling Cavoti Bar...";
            try
            {
                await Task.Run(InstallerLogic.RunUninstallation);
                Status.Text = "Cavoti Bar was removed.";
                await Task.Delay(800);
                Application.Current.Shutdown();
            }
            catch (Exception error)
            {
                InstallerLogger.Error("Interactive uninstall failed.", error);
                Status.Text = "Uninstall failed";
                Details.Text = InstallerLogger.AppendLogPath(error.Message);
                Details.Visibility = Visibility.Visible;
                Actions.Visibility = Visibility.Visible;
                Progress.Visibility = Visibility.Collapsed;
            }
        }

        private void Cancel_Click(object sender, RoutedEventArgs e) => Application.Current.Shutdown();

        private void Window_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            try { DragMove(); } catch { }
        }
    }
}
