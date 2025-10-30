import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmailAuthConfigSchema, UpdateEmailAuthConfigRequest } from '@insforge/shared-schemas';
import { emailConfigService } from '../services/email-config.service';
import { useToast } from '@/lib/hooks/useToast';

export function useEmailConfig() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  // Query to fetch email auth configuration
  const {
    data: config,
    isLoading,
    error,
    refetch,
  } = useQuery<EmailAuthConfigSchema>({
    queryKey: ['email-auth-config'],
    queryFn: () => emailConfigService.getConfig(),
  });

  // Mutation to update email auth configuration
  const updateConfigMutation = useMutation({
    mutationFn: (config: UpdateEmailAuthConfigRequest) => emailConfigService.updateConfig(config),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['email-auth-config'] });
      showToast('Email authentication configuration updated successfully', 'success');
    },
    onError: (error: Error) => {
      showToast(error.message || 'Failed to update email authentication configuration', 'error');
    },
  });

  return {
    // Data
    config,

    // Loading states
    isLoading,
    isUpdating: updateConfigMutation.isPending,

    // Errors
    error,

    // Actions
    updateConfig: updateConfigMutation.mutate,
    refetch,
  };
}
