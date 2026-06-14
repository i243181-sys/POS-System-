namespace SecureStore.POS.Security;

/// <summary>
/// Secure password hashing using BCrypt with cost factor 12.
/// Never stores or returns plain-text passwords.
/// </summary>
public static class PasswordHasher
{
    public const int MinimumPasswordLength = 12;
    public const int WorkFactor = 12;

    /// <summary>Hashes a plain-text password. Throws if password is null/empty.</summary>
    public static string Hash(string plainTextPassword)
    {
        if (string.IsNullOrWhiteSpace(plainTextPassword))
            throw new ArgumentException("Password cannot be empty.", nameof(plainTextPassword));
        if (plainTextPassword.Length < MinimumPasswordLength)
            throw new ArgumentException($"Password must be at least {MinimumPasswordLength} characters.", nameof(plainTextPassword));

        return BCrypt.Net.BCrypt.HashPassword(plainTextPassword, WorkFactor);
    }

    /// <summary>Verifies a plain-text password against a stored BCrypt hash.</summary>
    public static bool Verify(string plainTextPassword, string hash)
    {
        if (string.IsNullOrWhiteSpace(plainTextPassword) || string.IsNullOrWhiteSpace(hash))
            return false;

        try
        {
            return BCrypt.Net.BCrypt.Verify(plainTextPassword, hash);
        }
        catch
        {
            // BCrypt throws on malformed hash — treat as verification failure
            return false;
        }
    }

    public static bool NeedsRehash(string hash)
    {
        if (string.IsNullOrWhiteSpace(hash)) return true;
        var parts = hash.Split('$', StringSplitOptions.RemoveEmptyEntries);
        return parts.Length < 2 || !int.TryParse(parts[1], out var workFactor) || workFactor < WorkFactor;
    }
}
