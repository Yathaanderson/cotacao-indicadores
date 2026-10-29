import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

export function useProfile() {
  const auth = useAuth();
  const query = trpc.profile.me.useQuery(undefined, {
    enabled: Boolean(auth.user),
    retry: false,
    refetchOnWindowFocus: true,
  });

  return {
    ...auth,
    profile: query.data ?? null,
    profileLoading: Boolean(auth.user) && query.isLoading,
    isAdmin: query.data?.role === "admin",
  };
}