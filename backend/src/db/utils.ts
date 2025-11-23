export function mapUser(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    mobile: row.mobile,
    ktpUrl: row.ktp_url,
    npwpUrl: row.npwp_url,
    role: row.role,
    createdAt: row.created_at,
  };
}
