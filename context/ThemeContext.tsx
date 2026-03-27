import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkColors, lightColors } from '@/constants/colors';

type Colors = typeof darkColors;

const fonts = {
    heading: 'Charter-Bold',
    headingBlack: 'Charter-Black',
    headingRegular: 'Charter',
    headingItalic: 'Charter-Italic',
    body: 'Geist',
    bodyMedium: 'Geist-Medium',
    bodySemiBold: 'Geist-SemiBold',
    bodyBold: 'Geist-Bold',
};

type Fonts = typeof fonts;

interface ThemeContextType {
    isDark: boolean;
    colors: Colors;
    fonts: Fonts;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
    isDark: true,
    colors: darkColors,
    fonts,
    toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [isDark, setIsDark] = useState(true);

    useEffect(() => {
        AsyncStorage.getItem('darkMode').then(val => {
            if (val !== null) setIsDark(val === 'true');
        });
    }, []);

    function toggleTheme() {
        const next = !isDark;
        setIsDark(next);
        AsyncStorage.setItem('darkMode', String(next));
    }

    return (
        <ThemeContext.Provider value={{ isDark, colors: isDark ? darkColors : lightColors, fonts, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export const useTheme = () => useContext(ThemeContext);
