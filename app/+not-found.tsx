import { Redirect } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';

export default function NotFound() {
    const { session } = useAuthStore();
    if (session) return <Redirect href={'/(app)/' as any} />;
    return <Redirect href="/(auth)/onboarding" />;
}
