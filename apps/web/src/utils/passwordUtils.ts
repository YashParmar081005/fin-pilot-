/**
 * Password & Email validation and suggestion utilities.
 * Industry-standard security criteria.
 */

export interface PasswordChecks {
  length: boolean;
  upper: boolean;
  lower: boolean;
  number: boolean;
  special: boolean;
}

export interface PasswordStrength {
  score: number;
  label: 'Weak' | 'Medium' | 'Strong';
  color: string;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function evaluatePassword(password: string): { checks: PasswordChecks; strength: PasswordStrength } {
  const checks: PasswordChecks = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };

  const score = Object.values(checks).filter(Boolean).length;
  
  let label: 'Weak' | 'Medium' | 'Strong' = 'Weak';
  let color = '#c6482b'; // var(--red)

  if (score >= 5) {
    label = 'Strong';
    color = '#2f8f5b'; // var(--green)
  } else if (score >= 3) {
    label = 'Medium';
    color = '#e8b004'; // var(--amber)
  }

  return { checks, strength: { score, label, color } };
}

/**
 * Generates a cryptographically strong random password matching all security rules.
 */
export function generateStrongPassword(length = 14): string {
  const uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowers = 'abcdefghijkmnopqrstuvwxyz';
  const numbers = '23456789';
  const symbols = '!@#$%^&*()_+-=';
  const all = uppers + lowers + numbers + symbols;

  const cryptoObj = typeof window !== 'undefined' ? window.crypto : null;
  const getRandomByte = (): number => {
    if (cryptoObj && cryptoObj.getRandomValues) {
      const arr = new Uint8Array(1);
      cryptoObj.getRandomValues(arr);
      return arr[0]!;
    }
    return Math.floor(Math.random() * 256);
  };

  // Ensure at least one character from each required category
  const res: string[] = [
    uppers[getRandomByte() % uppers.length]!,
    lowers[getRandomByte() % lowers.length]!,
    numbers[getRandomByte() % numbers.length]!,
    symbols[getRandomByte() % symbols.length]!,
  ];

  for (let i = res.length; i < length; i++) {
    res.push(all[getRandomByte() % all.length]!);
  }

  // Fisher-Yates shuffle
  for (let i = res.length - 1; i > 0; i--) {
    const j = getRandomByte() % (i + 1);
    [res[i], res[j]] = [res[j]!, res[i]!];
  }

  return res.join('');
}

/**
 * Generates a list of unique strong password suggestions.
 */
export function generatePasswordSuggestions(count = 3): string[] {
  const list = new Set<string>();
  while (list.size < count) {
    list.add(generateStrongPassword());
  }
  return Array.from(list);
}
