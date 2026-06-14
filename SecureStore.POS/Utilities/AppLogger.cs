using Serilog;
using System.IO;

namespace SecureStore.POS;

/// <summary>
/// Centralised static logger. Wraps Serilog so all layers can call
/// AppLogger.LogInfo/LogError without taking a logger dependency.
/// </summary>
public static class AppLogger
{
    private static bool _initialised;

    public static void Initialise(string logFolder = "Logs")
    {
        Directory.CreateDirectory(logFolder);
        Log.Logger = new LoggerConfiguration()
            .MinimumLevel.Information()
            .WriteTo.File(
                Path.Combine(logFolder, "pos-.log"),
                rollingInterval: RollingInterval.Day,
                retainedFileCountLimit: 365, // Keep 1 year of logs
                outputTemplate: "[{Timestamp:yyyy-MM-dd HH:mm:ss} {Level:u3}] {Message:lj}{NewLine}{Exception}")
            .CreateLogger();
        _initialised = true;
    }

    public static void LogInfo(string message)
    {
        if (_initialised) Log.Information(message);
    }

    public static void LogWarning(string message)
    {
        if (_initialised) Log.Warning(message);
    }

    public static void LogError(Exception ex, string context)
    {
        if (_initialised)
            Log.Error(ex, "ERROR in {Context}: {Message}", context, ex.Message);
        else
            Console.Error.WriteLine($"[ERROR] {context}: {ex}");
    }

    public static void LogCritical(Exception ex, string context)
    {
        if (_initialised)
            Log.Fatal(ex, "CRITICAL in {Context}: {Message}", context, ex.Message);
    }

    public static void Shutdown() => Log.CloseAndFlush();
}
