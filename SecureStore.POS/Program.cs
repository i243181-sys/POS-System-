using Avalonia;

namespace SecureStore.POS;

public static class Program
{
    private const string SingleInstanceName = "SecureStore.POS.SingleInstance";

    [STAThread]
    public static int Main(string[] args)
    {
        AppLogger.Initialise(Path.Combine(AppContext.BaseDirectory, "Logs"));
        AppDomain.CurrentDomain.UnhandledException += (_, eventArgs) =>
        {
            if (eventArgs.ExceptionObject is Exception ex)
                AppLogger.LogCritical(ex, "Unhandled AppDomain exception");
        };
        TaskScheduler.UnobservedTaskException += (_, eventArgs) =>
        {
            AppLogger.LogError(eventArgs.Exception, "Unobserved task exception");
            eventArgs.SetObserved();
        };

        using var singleInstance = new Mutex(initiallyOwned: true, SingleInstanceName, out var createdNew);
        if (!createdNew)
        {
            AppLogger.LogWarning("SecureStore POS is already running. Second instance was blocked.");
            AppLogger.Shutdown();
            return 1;
        }

        try
        {
            return BuildAvaloniaApp().StartWithClassicDesktopLifetime(args);
        }
        catch (Exception ex)
        {
            AppLogger.LogCritical(ex, "Application startup failed");
            return 1;
        }
        finally
        {
            AppLogger.Shutdown();
        }
    }

    public static AppBuilder BuildAvaloniaApp() =>
        AppBuilder.Configure<App>()
            .UsePlatformDetect()
            .WithInterFont()
            .LogToTrace();
}
