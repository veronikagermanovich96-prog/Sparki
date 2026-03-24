export const fonts = {
    // Font families
    sans: 'System',        // ← replace later with e.g. 'Inter'
    serif: 'System',       // ← replace later with e.g. 'Playfair Display'

    sizes: {
        xs: 11,
        sm: 13,
        md: 15,
        lg: 17,
        xl: 20,
        xxl: 24,
        xxxl: 28,
    },

    weights: {
        regular: '400' as const,
        medium: '500' as const,
        semibold: '600' as const,
        bold: '700' as const,
    },

    lineHeights: {
        tight: 1.2,
        normal: 1.5,
        relaxed: 1.7,
    },
};
