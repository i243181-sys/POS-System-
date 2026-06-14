using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace SecureStore.POS.Presentation.Models;

public class CartItem : INotifyPropertyChanged
{
    private int _quantity;
    public int ProductID { get; set; }
    public string ProductName { get; set; } = string.Empty;
    public string? Barcode { get; set; }
    public decimal UnitPrice { get; set; }
    public int StockQuantity { get; set; }
    public int Quantity
    {
        get => _quantity;
        set
        {
            if (_quantity == value) return;
            _quantity = value;
            NotifyPropertyChanged();
            NotifyPropertyChanged(nameof(LineTotal));
        }
    }

    public decimal LineTotal => Math.Round(UnitPrice * Quantity, 2);

    public event PropertyChangedEventHandler? PropertyChanged;

    private void NotifyPropertyChanged([CallerMemberName] string? propertyName = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
    }
}
