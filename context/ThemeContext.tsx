import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkColors, lightColors } from '@/constants/colors';

type Colors = typeof darkColors;

interface ThemeContextType {
    isDark: boolean;
    colors: Colors;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
    isDark: true,
    colors: darkColors,
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
        <ThemeContext.Provider value={{ isDark, colors: isDark ? darkColors : lightColors, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export const useTheme = () => useContext(ThemeContext);
