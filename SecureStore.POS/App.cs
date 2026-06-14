using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Layout;
using Avalonia.Media;

namespace SecureStore.POS;

public class App : Avalonia.Application
{
    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            desktop.MainWindow = new Window
            {
                Title = "SecureStore POS",
                Width = 960,
                Height = 640,
                MinWidth = 720,
                MinHeight = 480,
                Content = new Border
                {
                    Padding = new Thickness(32),
                    Background = Brushes.White,
                    Child = new StackPanel
                    {
                        Spacing = 12,
                        VerticalAlignment = VerticalAlignment.Center,
                        HorizontalAlignment = HorizontalAlignment.Center,
                        Children =
                        {
                            new TextBlock
                            {
                                Text = "SecureStore POS",
                                FontSize = 32,
                                FontWeight = FontWeight.Bold,
                                HorizontalAlignment = HorizontalAlignment.Center
                            },
                            new TextBlock
                            {
                                Text = "The C# service project is available. Use the Electron app for the current full POS interface.",
                                FontSize = 16,
                                TextWrapping = TextWrapping.Wrap,
                                MaxWidth = 520,
                                TextAlignment = TextAlignment.Center,
                                Foreground = Brushes.DimGray
                            }
                        }
                    }
                }
            };
        }

        base.OnFrameworkInitializationCompleted();
    }
}
