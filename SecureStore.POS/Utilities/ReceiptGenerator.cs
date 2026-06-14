using SecureStore.POS.Application.DTOs;

namespace SecureStore.POS.Utilities;

/// <summary>
/// Generates plain-text and HTML receipt content.
/// For printing, WPF PrintDocument is used.
/// </summary>
public static class ReceiptGenerator
{
    public static string GenerateTextReceipt(SaleDto sale, string shopName,
        string shopAddress, string shopPhone, string footerMessage, string currencySymbol = "$")
    {
        var sb = new System.Text.StringBuilder();
        var line = new string('=', 44);
        var dash = new string('-', 44);

        sb.AppendLine(line);
        sb.AppendLine(Center(shopName, 44));
        sb.AppendLine(Center(shopAddress, 44));
        sb.AppendLine(Center(shopPhone, 44));
        sb.AppendLine(line);
        sb.AppendLine($"Invoice : {sale.InvoiceNumber}");
        sb.AppendLine($"Date    : {sale.SaleDate.ToLocalTime():dd/MM/yyyy HH:mm}");
        sb.AppendLine($"Cashier : {sale.CashierName}");
        sb.AppendLine(dash);
        sb.AppendLine($"{"ITEM",-22} {"QTY",4} {"PRICE",8} {"TOTAL",8}");
        sb.AppendLine(dash);

        foreach (var item in sale.Items)
        {
            var name = item.ProductName.Length > 22
                ? item.ProductName[..19] + "..." : item.ProductName;
            sb.AppendLine(
                $"{name,-22} {item.Quantity,4} {currencySymbol}{item.UnitPrice,7:F2} {currencySymbol}{item.LineTotal,7:F2}");
            if (item.LineDiscount > 0)
                sb.AppendLine($"  Discount:{currencySymbol}{item.LineDiscount:F2}");
        }

        sb.AppendLine(dash);
        sb.AppendLine($"{"Sub-Total:",-34} {currencySymbol}{sale.SubTotal,7:F2}");
        if (sale.DiscountAmount > 0)
            sb.AppendLine($"{"Discount (" + sale.DiscountPercent + "%):",-34} -{currencySymbol}{sale.DiscountAmount,6:F2}");
        if (sale.TaxAmount > 0)
            sb.AppendLine($"{"Tax:",-34} {currencySymbol}{sale.TaxAmount,7:F2}");
        sb.AppendLine($"{"NET TOTAL:",-34} {currencySymbol}{sale.NetTotal,7:F2}");
        sb.AppendLine($"{"Paid:",-34} {currencySymbol}{sale.PaidAmount,7:F2}");
        sb.AppendLine($"{"Change:",-34} {currencySymbol}{sale.ChangeAmount,7:F2}");
        sb.AppendLine(line);
        sb.AppendLine(Center(footerMessage, 44));
        sb.AppendLine(line);

        return sb.ToString();
    }

    public static string GenerateHtmlReceipt(SaleDto sale, string shopName,
        string shopAddress, string shopPhone, string footerMessage, string currencySymbol = "$")
    {
        var itemRows = string.Join("\n", sale.Items.Select(i =>
            $@"<tr>
                <td>{System.Net.WebUtility.HtmlEncode(i.ProductName)}</td>
                <td style='text-align:center'>{i.Quantity}</td>
                <td style='text-align:right'>{currencySymbol}{i.UnitPrice:F2}</td>
                <td style='text-align:right'>{(i.LineDiscount > 0 ? $"-{currencySymbol}{i.LineDiscount:F2}" : "")}</td>
                <td style='text-align:right'>{currencySymbol}{i.LineTotal:F2}</td>
               </tr>"));

        return $@"<!DOCTYPE html>
<html lang='en'>
<head>
  <meta charset='UTF-8'>
  <title>Receipt - {sale.InvoiceNumber}</title>
  <style>
    body {{ font-family: 'Courier New', monospace; max-width: 400px; margin: 0 auto; padding: 20px; }}
    h2 {{ text-align:center; margin:4px; }}
    .center {{ text-align:center; }}
    table {{ width:100%; border-collapse:collapse; margin:8px 0; }}
    th {{ border-bottom:2px solid #000; padding:4px; font-size:12px; }}
    td {{ padding:3px; font-size:12px; }}
    .total-row td {{ border-top:1px solid #000; font-weight:bold; }}
    .divider {{ border-top:1px dashed #000; margin:8px 0; }}
    .footer {{ text-align:center; margin-top:12px; font-size:11px; }}
  </style>
</head>
<body>
  <h2>{System.Net.WebUtility.HtmlEncode(shopName)}</h2>
  <p class='center'>{System.Net.WebUtility.HtmlEncode(shopAddress)}<br>{System.Net.WebUtility.HtmlEncode(shopPhone)}</p>
  <div class='divider'></div>
  <p><b>Invoice:</b> {sale.InvoiceNumber}<br>
     <b>Date:</b> {sale.SaleDate.ToLocalTime():dd/MM/yyyy HH:mm}<br>
     <b>Cashier:</b> {System.Net.WebUtility.HtmlEncode(sale.CashierName)}</p>
  <div class='divider'></div>
  <table>
    <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Disc</th><th>Total</th></tr></thead>
    <tbody>{itemRows}</tbody>
  </table>
  <div class='divider'></div>
  <table>
    <tr><td>Sub-Total</td><td style='text-align:right'>{currencySymbol}{sale.SubTotal:F2}</td></tr>
    {(sale.DiscountAmount > 0 ? $"<tr><td>Discount ({sale.DiscountPercent}%)</td><td style='text-align:right'>-{currencySymbol}{sale.DiscountAmount:F2}</td></tr>" : "")}
    {(sale.TaxAmount > 0 ? $"<tr><td>Tax</td><td style='text-align:right'>{currencySymbol}{sale.TaxAmount:F2}</td></tr>" : "")}
    <tr class='total-row'><td><b>NET TOTAL</b></td><td style='text-align:right'><b>{currencySymbol}{sale.NetTotal:F2}</b></td></tr>
    <tr><td>Paid</td><td style='text-align:right'>{currencySymbol}{sale.PaidAmount:F2}</td></tr>
    <tr><td>Change</td><td style='text-align:right'>{currencySymbol}{sale.ChangeAmount:F2}</td></tr>
  </table>
  <div class='divider'></div>
  <p class='footer'>{System.Net.WebUtility.HtmlEncode(footerMessage)}</p>
</body>
</html>";
    }

    private static string Center(string text, int width) =>
        text.Length >= width ? text : text.PadLeft((width + text.Length) / 2).PadRight(width);
}
