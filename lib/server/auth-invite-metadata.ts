/** Metadatos en Auth al invitar: obliga pasar por /reset-password antes de usar la app. */
export const INVITE_USER_METADATA = {
  must_set_password: true,
} as const;

export async function markAuthUserMustSetPassword(
  adminAuth: {
    updateUserById: (
      id: string,
      attrs: { user_metadata?: Record<string, unknown> },
    ) => Promise<{ error: { message: string } | null }>;
  },
  userId: string,
): Promise<void> {
  await adminAuth.updateUserById(userId, {
    user_metadata: { ...INVITE_USER_METADATA },
  });
}
