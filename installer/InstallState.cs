using System;
using System.IO;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;

namespace CavotiInstaller
{
    [DataContract]
    public sealed class InstallState
    {
        private static readonly DataContractJsonSerializer Serializer = new DataContractJsonSerializer(typeof(InstallState));
        [DataMember(Name = "currentVersion")] public string CurrentVersion { get; set; }
        [DataMember(Name = "previousVersion")] public string PreviousVersion { get; set; }
        [DataMember(Name = "activatedAtUtc")] public string ActivatedAtUtc { get; set; }

        public static InstallState Load(string path)
        {
            if (!File.Exists(path)) return null;
            using (var stream = File.OpenRead(path)) return Serializer.ReadObject(stream) as InstallState;
        }

        public void Save(string path)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            var temp = path + ".tmp";
            using (var stream = File.Create(temp)) Serializer.WriteObject(stream, this);
            if (File.Exists(path)) File.Replace(temp, path, null);
            else File.Move(temp, path);
        }

        public static string NormalizeVersion(string value)
        {
            var version = (value ?? string.Empty).Trim();
            return version.StartsWith("app-", StringComparison.OrdinalIgnoreCase) ? version.Substring(4) : version;
        }
    }
}
