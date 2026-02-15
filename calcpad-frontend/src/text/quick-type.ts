/**
 * Quick type replacement map: shortcut → Unicode symbol.
 * Triggered by typing the shortcut followed by a space.
 */
export const QUICK_TYPE_MAP: Map<string, string> = new Map([
    // Special Symbols
    ['~%', '‰'],      // Per Mille
    ['~%%', '‱'],     // Per Ten Thousand
    ['~0', '°'],      // Degree Symbol
    ["~'", '′'],      // Prime
    ['~"', '″'],      // Double Prime
    ["~'''", '‴'],    // Triple Prime
    ["~''''", '⁗'],   // Quadruple Prime
    ['~/o', 'ø'],     // Lowercase Diameter
    ['~/O', 'Ø'],     // Uppercase Diameter

    // Greek Letters (Lowercase)
    ['~a', 'α'],      // Alpha
    ['~b', 'β'],      // Beta
    ['~g', 'γ'],      // Gamma
    ['~d', 'δ'],      // Delta
    ['~e', 'ε'],      // Epsilon
    ['~z', 'ζ'],      // Zeta
    ['~h', 'η'],      // Eta
    ['~q', 'θ'],      // Theta
    ['~i', 'ι'],      // Iota
    ['~k', 'κ'],      // Kappa
    ['~l', 'λ'],      // Lambda
    ['~m', 'μ'],      // Mu
    ['~n', 'ν'],      // Nu
    ['~x', 'ξ'],      // Xi
    ['~o', 'ο'],      // Omicron
    ['~p', 'π'],      // Pi
    ['~r', 'ρ'],      // Rho
    ['~j', 'ς'],      // Final Sigma
    ['~s', 'σ'],      // Sigma
    ['~t', 'τ'],      // Tau
    ['~u', 'υ'],      // Upsilon
    ['~f', 'φ'],      // Phi
    ['~c', 'χ'],      // Chi
    ['~y', 'ψ'],      // Psi
    ['~w', 'ω'],      // Omega

    // Greek Letters (Uppercase)
    ['~A', 'Α'],      // Alpha
    ['~B', 'Β'],      // Beta
    ['~G', 'Γ'],      // Gamma
    ['~D', 'Δ'],      // Delta
    ['~E', 'Ε'],      // Epsilon
    ['~Z', 'Ζ'],      // Zeta
    ['~H', 'Η'],      // Eta
    ['~Q', 'Θ'],      // Theta
    ['~I', 'Ι'],      // Iota
    ['~K', 'Κ'],      // Kappa
    ['~L', 'Λ'],      // Lambda
    ['~M', 'Μ'],      // Mu
    ['~N', 'Ν'],      // Nu
    ['~X', 'Ξ'],      // Xi
    ['~O', 'Ο'],      // Omicron
    ['~P', 'Π'],      // Pi
    ['~R', 'Ρ'],      // Rho
    ['~S', 'Σ'],      // Sigma
    ['~T', 'Τ'],      // Tau
    ['~U', 'Υ'],      // Upsilon
    ['~F', 'Φ'],      // Phi
    ['~C', 'Χ'],      // Chi
    ['~Y', 'Ψ'],      // Psi
    ['~W', 'Ω'],      // Omega
]);

/**
 * Find quick type replacement at the given position.
 * Checks for patterns starting with ~ and up to 4 characters after ~.
 */
export function findQuickTypeReplacement(lineText: string, endPosition: number): {
    startPos: number;
    endPos: number;
    replacement: string;
} | null {
    const maxLength = 5; // ~ + up to 4 characters

    for (let len = 2; len <= maxLength && len <= endPosition; len++) {
        const startPos = endPosition - len;
        const candidate = lineText.substring(startPos, endPosition);

        if (candidate[0] === '~') {
            const replacement = QUICK_TYPE_MAP.get(candidate);
            if (replacement) {
                return { startPos, endPos: endPosition, replacement };
            }
        }
    }

    return null;
}
