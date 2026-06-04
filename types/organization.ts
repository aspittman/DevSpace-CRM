export type GlobalRole = 'devspace_admin' | 'devspace_member' | 'customer'

export type OrganizationType = 'devspace' | 'customer'

export interface Organization {
  id: string
  name: string
  slug: string | null
  type: OrganizationType
  created_at: string
  updated_at: string
}

export interface Profile {
  id: string
  email: string | null
  full_name: string | null
  global_role: GlobalRole
  created_at: string
}

export type OrganizationRole =
  | 'owner'
  | 'admin'
  | 'member'
  | 'customer_admin'
  | 'customer_member'

export interface OrganizationMember {
  id: string
  organization_id: string
  user_id: string
  role: OrganizationRole
  created_at: string
}