/**
 * Cross-platform haptic feedback wrapper.
 * No-ops on web; lazily imports expo-haptics on native.
 */
import { Platform } from 'react-native';

export async function impactLight() {
    if (Platform.OS === 'web') return;
    const Haptics = await import('expo-haptics');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export async function impactMedium() {
    if (Platform.OS === 'web') return;
    const Haptics = await import('expo-haptics');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

export async function impactHeavy() {
    if (Platform.OS === 'web') return;
    const Haptics = await import('expo-haptics');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
}

export async function notificationSuccess() {
    if (Platform.OS === 'web') return;
    const Haptics = await import('expo-haptics');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

export async function selectionChanged() {
    if (Platform.OS === 'web') return;
    const Haptics = await import('expo-haptics');
    Haptics.selectionAsync();
}
