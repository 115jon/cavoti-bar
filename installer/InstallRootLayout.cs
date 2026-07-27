using System;
using System.IO;

namespace CavotiInstaller
{
    public sealed class InstallRootLayout
    {
        public const string RootName = "CavotiBar";
        public InstallRootLayout(string rootPath) { RootPath = Path.GetFullPath(rootPath); }
        public string RootPath { get; }
        public string UpdatePath => Path.Combine(RootPath, "Update.exe");
        public string RootIconPath => Path.Combine(RootPath, "app.ico");
        public string StatePath => Path.Combine(RootPath, "current.json");
        public string StagingPath => Path.Combine(RootPath, "staging");
        public string VersionPath(string version) => Path.Combine(RootPath, "app-" + InstallState.NormalizeVersion(version));
        public static InstallRootLayout FromLocalAppData() => new InstallRootLayout(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), RootName));
    }
}
