using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;

namespace CavotiInstaller
{
    internal static class InstallerLogger
    {
        private static readonly object Sync = new object();
        private static string _path;

        public static void Initialize(string[] args)
        {
            var root = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            var directory = Path.Combine(root, "CavotiBar", "logs", "installer");
            Directory.CreateDirectory(directory);
            _path = Path.Combine(directory, "installer-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + "-pid" + Process.GetCurrentProcess().Id + ".log");
            Info("Installer started: " + FormatArgs(args));
        }

        public static void Info(string message) => Write("INFO", message, null);
        public static void Error(string message, Exception error) => Write("ERROR", message, error);
        public static string AppendLogPath(string message) => message + Environment.NewLine + "Installer log: " + _path;

        private static string FormatArgs(string[] args)
        {
            if (args == null || args.Length == 0) return "(none)";
            return string.Join(" ", args.Select(arg =>
                string.IsNullOrWhiteSpace(arg)
                    ? "[empty]"
                    : arg.Contains("://")
                        ? "[url]"
                        : arg.StartsWith("/") || arg.StartsWith("-")
                            ? arg
                            : "[value]"));
        }

        private static void Write(string level, string message, Exception error)
        {
            try
            {
                lock (Sync)
                {
                    File.AppendAllText(_path, "[" + DateTime.Now.ToString("O") + "] [" + level + "] " + message + Environment.NewLine + (error == null ? string.Empty : error + Environment.NewLine), Encoding.UTF8);
                }
            }
            catch { }
        }
    }
}
