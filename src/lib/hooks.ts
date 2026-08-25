"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError, type UsageQuery } from "@/lib/api";
import type {
  GatewayUpdateBody,
  GrantBody,
  GroupPatchBody,
  KeyPatchBody,
  ModelBody,
  NewGatewayBody,
  NewGroupBody,
  NewKeyBody,
  NewProviderBody,
  ProviderPatchBody,
  TeamRole,
} from "@/lib/types";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: api.me,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTeams() {
  return useQuery({
    queryKey: ["teams"],
    queryFn: api.teams,
  });
}

export function useTeamMembers(teamId: string) {
  return useQuery({
    queryKey: ["members", teamId],
    queryFn: () => api.members(teamId),
  });
}

export function useInvitations(teamId: string) {
  return useQuery({
    queryKey: ["invitations", teamId],
    queryFn: () => api.invitations(teamId),
  });
}

export function useGateways() {
  return useQuery({
    queryKey: ["gateways"],
    queryFn: api.gateways,
    refetchInterval: 30_000,
  });
}

export function useProviders(gatewayId: string) {
  return useQuery({
    queryKey: ["providers", gatewayId],
    queryFn: () => api.providers(gatewayId),
    refetchInterval: 30_000,
  });
}

export function useKeys(gatewayId: string, includeDeleted = false) {
  return useQuery({
    queryKey: ["keys", gatewayId, includeDeleted],
    queryFn: () => api.keys(gatewayId, includeDeleted),
  });
}

export function useGroups(gatewayId: string, includeDeleted = false) {
  return useQuery({
    queryKey: ["groups", gatewayId, includeDeleted],
    queryFn: () => api.groups(gatewayId, includeDeleted),
  });
}

export function useUsage(gatewayId: string, query: UsageQuery) {
  return useQuery({
    queryKey: ["usage", gatewayId, query],
    queryFn: () => api.usage(gatewayId, query),
  });
}

export function useUsageTimeseries(gatewayId: string, query: UsageQuery) {
  return useQuery({
    queryKey: ["usage-timeseries", gatewayId, query],
    queryFn: () => api.usageTimeseries(gatewayId, query),
    // Bucketing paginates the raw export server-side — keep it fresh but
    // don't refetch on every focus.
    staleTime: 60_000,
  });
}

export function useCombinedUsageTimeseries(query: UsageQuery) {
  return useQuery({
    queryKey: ["combined-usage-timeseries", query],
    queryFn: () => api.combinedUsageTimeseries(query),
    staleTime: 60_000,
  });
}

export function useCombinedUsage(query: UsageQuery) {
  return useQuery({
    queryKey: ["combined-usage", query],
    queryFn: () => api.combinedUsage(query),
  });
}

function toastError(error: unknown) {
  const message =
    error instanceof ApiError
      ? error.code
        ? `${error.message} (${error.code})`
        : error.message
      : error instanceof Error
        ? error.message
        : "unexpected error";
  toast.error(message);
}

/** Invalidate everything scoped to one gateway after a mutation. */
function useInvalidateGateway(gatewayId: string) {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: ["keys", gatewayId] });
    void client.invalidateQueries({ queryKey: ["groups", gatewayId] });
    void client.invalidateQueries({ queryKey: ["usage", gatewayId] });
    void client.invalidateQueries({ queryKey: ["gateways"] });
  };
}

export function useCreateTeam() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.createTeam(name),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["teams"] });
      toast.success("Team created");
    },
    onError: toastError,
  });
}

export function useRenameTeam() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, name }: { teamId: string; name: string }) =>
      api.renameTeam(teamId, name),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["teams"] });
      void client.invalidateQueries({ queryKey: ["gateways"] });
      toast.success("Team renamed");
    },
    onError: toastError,
  });
}

export function useDeleteTeam() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (teamId: string) => api.deleteTeam(teamId),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["teams"] });
      void client.invalidateQueries({ queryKey: ["gateways"] });
      toast.success("Team deleted");
    },
    onError: toastError,
  });
}

export function useUpdateMemberRole(teamId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: TeamRole }) =>
      api.updateMemberRole(teamId, userId, role),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["members", teamId] });
      void client.invalidateQueries({ queryKey: ["teams"] });
      toast.success("Role updated");
    },
    onError: toastError,
  });
}

export function useRemoveMember(teamId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.removeMember(teamId, userId),
    onSuccess: (result) => {
      if (result.left) {
        // The caller left the team: everything they could see may change.
        void client.invalidateQueries();
      } else {
        void client.invalidateQueries({ queryKey: ["members", teamId] });
      }
      toast.success("Member removed");
    },
    onError: toastError,
  });
}

export function useInvite(teamId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ email, role }: { email: string; role: TeamRole }) =>
      api.invite(teamId, email, role),
    onSuccess: (invitation) => {
      void client.invalidateQueries({ queryKey: ["invitations", teamId] });
      toast.success(
        `${invitation.email} invited — the invite is claimed automatically on their next sign-in`,
      );
    },
    onError: toastError,
  });
}

export function useRevokeInvitation(teamId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) => api.revokeInvitation(teamId, inviteId),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["invitations", teamId] });
      toast.success("Invitation revoked");
    },
    onError: toastError,
  });
}

export function useCreateGateway() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: NewGatewayBody) => api.createGateway(body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["gateways"] });
      toast.success("Gateway registered");
    },
    onError: toastError,
  });
}

export function useUpdateGateway(gatewayId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: GatewayUpdateBody) => api.updateGateway(gatewayId, body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["gateways"] });
      toast.success("Gateway updated");
    },
    onError: toastError,
  });
}

export function useDeleteGateway() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (gatewayId: string) => api.deleteGateway(gatewayId),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["gateways"] });
      toast.success("Gateway removed from the console (the gateway itself is untouched)");
    },
    onError: toastError,
  });
}

export function useGatewayConfig(gatewayId: string) {
  return useQuery({
    queryKey: ["config", gatewayId],
    queryFn: () => api.gatewayConfig(gatewayId),
  });
}

/** Invalidate config-derived views after a provider/model mutation. */
function useInvalidateConfig(gatewayId: string) {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: ["config", gatewayId] });
    void client.invalidateQueries({ queryKey: ["providers", gatewayId] });
    void client.invalidateQueries({ queryKey: ["gateways"] });
  };
}

export function useAddProvider(gatewayId: string) {
  const invalidate = useInvalidateConfig(gatewayId);
  return useMutation({
    mutationFn: (body: NewProviderBody) => api.addProvider(gatewayId, body),
    onSuccess: (provider) => {
      invalidate();
      toast.success(`Provider "${provider.name}" added`);
    },
    onError: toastError,
  });
}

export function useUpdateProvider(gatewayId: string) {
  const invalidate = useInvalidateConfig(gatewayId);
  return useMutation({
    mutationFn: ({ name, body }: { name: string; body: ProviderPatchBody }) =>
      api.updateProvider(gatewayId, name, body),
    onSuccess: () => {
      invalidate();
      toast.success("Provider updated");
    },
    onError: toastError,
  });
}

export function useDeleteProvider(gatewayId: string) {
  const invalidate = useInvalidateConfig(gatewayId);
  return useMutation({
    mutationFn: (name: string) => api.deleteProvider(gatewayId, name),
    onSuccess: () => {
      invalidate();
      toast.success("Provider removed");
    },
    onError: toastError,
  });
}

export function useAddModel(gatewayId: string) {
  const invalidate = useInvalidateConfig(gatewayId);
  return useMutation({
    mutationFn: ({ provider, body }: { provider: string; body: ModelBody }) =>
      api.addModel(gatewayId, provider, body),
    onSuccess: (model) => {
      invalidate();
      toast.success(`Model "${model.id}" added`);
    },
    onError: toastError,
  });
}

export function useUpdateModel(gatewayId: string) {
  const invalidate = useInvalidateConfig(gatewayId);
  return useMutation({
    mutationFn: ({
      provider,
      modelId,
      body,
    }: {
      provider: string;
      modelId: string;
      body: Partial<ModelBody>;
    }) => api.updateModel(gatewayId, provider, modelId, body),
    onSuccess: () => {
      invalidate();
      toast.success("Model updated");
    },
    onError: toastError,
  });
}

export function useDeleteModel(gatewayId: string) {
  const invalidate = useInvalidateConfig(gatewayId);
  return useMutation({
    mutationFn: ({ provider, modelId }: { provider: string; modelId: string }) =>
      api.deleteModel(gatewayId, provider, modelId),
    onSuccess: () => {
      invalidate();
      toast.success("Model removed");
    },
    onError: toastError,
  });
}

export function useCreateKey(gatewayId: string) {
  const invalidate = useInvalidateGateway(gatewayId);
  return useMutation({
    mutationFn: (body: NewKeyBody) => api.createKey(gatewayId, body),
    onSuccess: invalidate,
    onError: toastError,
  });
}

export function usePatchKey(gatewayId: string) {
  const invalidate = useInvalidateGateway(gatewayId);
  return useMutation({
    mutationFn: ({ keyId, body }: { keyId: string; body: KeyPatchBody }) =>
      api.patchKey(gatewayId, keyId, body),
    onSuccess: () => {
      invalidate();
      toast.success("Key updated");
    },
    onError: toastError,
  });
}

export function useDeleteKey(gatewayId: string) {
  const invalidate = useInvalidateGateway(gatewayId);
  return useMutation({
    mutationFn: (keyId: string) => api.deleteKey(gatewayId, keyId),
    onSuccess: () => {
      invalidate();
      toast.success("Key deleted (soft delete; usage history is preserved)");
    },
    onError: toastError,
  });
}

export function useRotateKey(gatewayId: string) {
  const invalidate = useInvalidateGateway(gatewayId);
  return useMutation({
    mutationFn: (keyId: string) => api.rotateKey(gatewayId, keyId),
    onSuccess: invalidate,
    onError: toastError,
  });
}

export function useGrantKey(gatewayId: string) {
  const invalidate = useInvalidateGateway(gatewayId);
  return useMutation({
    mutationFn: ({ keyId, body }: { keyId: string; body: GrantBody }) =>
      api.grantKey(gatewayId, keyId, body),
    onSuccess: () => {
      invalidate();
      toast.success("Budget granted");
    },
    onError: toastError,
  });
}

export function useCreateGroup(gatewayId: string) {
  const invalidate = useInvalidateGateway(gatewayId);
  return useMutation({
    mutationFn: (body: NewGroupBody) => api.createGroup(gatewayId, body),
    onSuccess: () => {
      invalidate();
      toast.success("Group created");
    },
    onError: toastError,
  });
}

export function usePatchGroup(gatewayId: string) {
  const invalidate = useInvalidateGateway(gatewayId);
  return useMutation({
    mutationFn: ({ groupId, body }: { groupId: string; body: GroupPatchBody }) =>
      api.patchGroup(gatewayId, groupId, body),
    onSuccess: () => {
      invalidate();
      toast.success("Group updated");
    },
    onError: toastError,
  });
}

export function useDeleteGroup(gatewayId: string) {
  const invalidate = useInvalidateGateway(gatewayId);
  return useMutation({
    mutationFn: (groupId: string) => api.deleteGroup(gatewayId, groupId),
    onSuccess: () => {
      invalidate();
      toast.success("Group deleted");
    },
    onError: toastError,
  });
}

export function useGrantGroup(gatewayId: string) {
  const invalidate = useInvalidateGateway(gatewayId);
  return useMutation({
    mutationFn: ({ groupId, body }: { groupId: string; body: GrantBody }) =>
      api.grantGroup(gatewayId, groupId, body),
    onSuccess: () => {
      invalidate();
      toast.success("Budget granted");
    },
    onError: toastError,
  });
}

export function usePutProviderKey(gatewayId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ name, key }: { name: string; key: string }) =>
      api.putProviderKey(gatewayId, name, key),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["providers", gatewayId] });
      toast.success("Provider key stored; the gateway hot-reloads it");
    },
    onError: toastError,
  });
}
