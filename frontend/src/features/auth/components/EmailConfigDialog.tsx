import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/radix/Button';
import { Input } from '@/components/radix/Input';
import { Switch } from '@/components/radix/Switch';
import { Checkbox } from '@/components/Checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/radix/Dialog';
import {
  updateEmailAuthConfigRequestSchema,
  type UpdateEmailAuthConfigRequest,
} from '@insforge/shared-schemas';
import { useEmailConfig } from '@/features/auth/hooks/useEmailConfig';
import { isInsForgeCloudProject } from '@/lib/utils/utils';

interface EmailConfigDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function EmailConfigDialog({ isOpen, onClose, onSuccess }: EmailConfigDialogProps) {
  const { config, isLoading, isUpdating, updateConfig } = useEmailConfig();

  const form = useForm<UpdateEmailAuthConfigRequest>({
    resolver: zodResolver(updateEmailAuthConfigRequestSchema),
    defaultValues: {
      requireEmailVerification: false,
      passwordMinLength: 6,
      requireNumber: false,
      requireLowercase: false,
      requireUppercase: false,
      requireSpecialChar: false,
      verifyEmailRedirectTo: null,
      resetPasswordRedirectTo: null,
    },
  });

  // Load configuration when dialog opens or config changes
  useEffect(() => {
    if (isOpen && config) {
      form.reset({
        requireEmailVerification: config.requireEmailVerification,
        passwordMinLength: config.passwordMinLength,
        requireNumber: config.requireNumber,
        requireLowercase: config.requireLowercase,
        requireUppercase: config.requireUppercase,
        requireSpecialChar: config.requireSpecialChar,
        verifyEmailRedirectTo: config.verifyEmailRedirectTo ?? null,
        resetPasswordRedirectTo: config.resetPasswordRedirectTo ?? null,
      });
    }
  }, [config, form, isOpen]);

  const handleSubmitData = (data: UpdateEmailAuthConfigRequest) => {
    updateConfig(data, {
      onSuccess: () => {
        // Call success callback if provided
        if (onSuccess) {
          onSuccess();
        }
        // Close dialog
        onClose();
      },
    });
  };

  const handleSubmit = () => {
    void form.handleSubmit(handleSubmitData)();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[700px] dark:bg-neutral-800 dark:text-white p-0 gap-0">
        <DialogHeader className="px-6 py-3 border-b border-zinc-200 dark:border-neutral-700">
          <DialogTitle>Email Authentication</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <div className="text-sm text-gray-500 dark:text-zinc-400">
                Loading configuration...
              </div>
            </div>
          </div>
        ) : (
          <>
            <form onSubmit={(e) => e.preventDefault()} className="flex flex-col">
              {isInsForgeCloudProject() && (
                <div className="space-y-6 p-6">
                  {/* Email Verification Toggle */}
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        Require Email Verification
                      </span>
                      <span className="text-xs text-zinc-500 dark:text-neutral-400">
                        Users must verify their email address before they can sign in
                      </span>
                    </div>
                    <Controller
                      name="requireEmailVerification"
                      control={form.control}
                      render={({ field }) => (
                        <Switch
                          checked={field.value}
                          onCheckedChange={(value) => {
                            field.onChange(value);
                          }}
                        />
                      )}
                    />
                  </div>

                  {/* Verify Email Redirect URL - Only shown when email verification is enabled */}
                  {form.watch('requireEmailVerification') && (
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-row items-center justify-between gap-10">
                        <div className="flex flex-col gap-1">
                          <label className="text-sm text-zinc-950 dark:text-white">
                            Redirect URL After Email Verification
                          </label>
                          <span className="text-xs text-zinc-500 dark:text-neutral-400">
                            Your app url after successful verification
                          </span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <Input
                            type="url"
                            placeholder="https://yourapp.com/welcome"
                            {...form.register('verifyEmailRedirectTo')}
                            className={`w-[340px] dark:bg-neutral-900 dark:placeholder:text-neutral-400 dark:border-neutral-700 dark:text-white ${
                              form.formState.errors.verifyEmailRedirectTo
                                ? 'border-red-500 dark:border-red-500'
                                : ''
                            }`}
                          />
                          {form.formState.errors.verifyEmailRedirectTo && (
                            <span className="text-xs text-red-500">
                              {form.formState.errors.verifyEmailRedirectTo.message ||
                                'Please enter a valid URL'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Password Requirements Section */}
              <div className="space-y-6 p-6 border-t border-zinc-200 dark:border-neutral-700">
                {/* Password Length */}
                <div className="flex flex-row items-center justify-between gap-10">
                  <div className="flex flex-col gap-1">
                    <label className="text-sm text-zinc-950 dark:text-white">
                      Minimum Password Length
                    </label>
                    <span className="text-xs text-zinc-500 dark:text-neutral-400">
                      Must be between 4 and 128 characters
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Input
                      type="number"
                      min="4"
                      max="128"
                      {...form.register('passwordMinLength', { valueAsNumber: true })}
                      className={`w-[340px] dark:bg-neutral-900 dark:placeholder:text-neutral-400 dark:border-neutral-700 dark:text-white ${
                        form.formState.errors.passwordMinLength
                          ? 'border-red-500 dark:border-red-500'
                          : ''
                      }`}
                    />
                    {form.formState.errors.passwordMinLength && (
                      <span className="text-xs text-red-500">
                        {form.formState.errors.passwordMinLength.message ||
                          'Must be between 4 and 128 characters'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Password Strength Checkboxes */}
                <div className="flex flex-col gap-3">
                  <label className="text-sm text-zinc-950 dark:text-white">
                    Password Strength Requirements
                  </label>
                  <div className="space-y-3 pl-1">
                    <Controller
                      name="requireNumber"
                      control={form.control}
                      render={({ field }) => (
                        <label className="flex items-center gap-3 cursor-pointer">
                          <Checkbox
                            checked={field.value}
                            onChange={(checked) => field.onChange(checked)}
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            At least 1 number
                          </span>
                        </label>
                      )}
                    />

                    <Controller
                      name="requireLowercase"
                      control={form.control}
                      render={({ field }) => (
                        <label className="flex items-center gap-3 cursor-pointer">
                          <Checkbox
                            checked={field.value}
                            onChange={(checked) => field.onChange(checked)}
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            At least 1 lowercase character
                          </span>
                        </label>
                      )}
                    />

                    <Controller
                      name="requireUppercase"
                      control={form.control}
                      render={({ field }) => (
                        <label className="flex items-center gap-3 cursor-pointer">
                          <Checkbox
                            checked={field.value}
                            onChange={(checked) => field.onChange(checked)}
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            At least 1 uppercase character
                          </span>
                        </label>
                      )}
                    />

                    <Controller
                      name="requireSpecialChar"
                      control={form.control}
                      render={({ field }) => (
                        <label className="flex items-center gap-3 cursor-pointer">
                          <Checkbox
                            checked={field.value}
                            onChange={(checked) => field.onChange(checked)}
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            At least 1 special character
                          </span>
                        </label>
                      )}
                    />
                  </div>
                </div>

                {/* Password Reset Redirect URL - Only shown for InsForge Cloud projects */}
                {isInsForgeCloudProject() && (
                  <div className="flex flex-row items-center justify-between gap-10">
                    <div className="flex flex-col gap-1">
                      <label className="text-sm text-zinc-950 dark:text-white">
                        Redirect URL After Password Reset
                      </label>
                      <span className="text-xs text-zinc-500 dark:text-neutral-400">
                        Your app url after successful reset
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Input
                        type="url"
                        placeholder="https://yourapp.com/login"
                        {...form.register('resetPasswordRedirectTo')}
                        className={`w-[340px] dark:bg-neutral-900 dark:placeholder:text-neutral-400 dark:border-neutral-700 dark:text-white ${
                          form.formState.errors.resetPasswordRedirectTo
                            ? 'border-red-500 dark:border-red-500'
                            : ''
                        }`}
                      />
                      {form.formState.errors.resetPasswordRedirectTo && (
                        <span className="text-xs text-red-500">
                          {form.formState.errors.resetPasswordRedirectTo.message ||
                            'Please enter a valid URL'}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </form>

            <DialogFooter className="p-6 border-t border-zinc-200 dark:border-neutral-700">
              <Button
                type="button"
                className="h-9 w-30 px-3 py-2 dark:bg-neutral-600 dark:text-white dark:border-transparent dark:hover:bg-neutral-700"
                variant="outline"
                onClick={onClose}
                disabled={isUpdating}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={isUpdating}
                className="h-9 w-30 px-3 py-2 dark:bg-emerald-300 dark:text-black dark:hover:bg-emerald-400"
              >
                {isUpdating ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
