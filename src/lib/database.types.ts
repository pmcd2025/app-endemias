export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export type Database = {
    public: {
        Tables: {
            absences: {
                Row: {
                    approved: boolean | null
                    approved_at: string | null
                    approved_by: string | null
                    cid_code: string | null
                    created_at: string | null
                    created_by: string | null
                    days_count: number
                    doctor_name: string | null
                    document_url: string | null
                    end_date: string
                    id: string
                    reason: string | null
                    server_id: string
                    start_date: string
                    type: string
                    updated_at: string | null
                }
                Insert: {
                    approved?: boolean | null
                    approved_at?: string | null
                    approved_by?: string | null
                    cid_code?: string | null
                    created_at?: string | null
                    created_by?: string | null
                    days_count: number
                    doctor_name?: string | null
                    document_url?: string | null
                    end_date: string
                    id?: string
                    reason?: string | null
                    server_id: string
                    start_date: string
                    type: string
                    updated_at?: string | null
                }
                Update: {
                    approved?: boolean | null
                    approved_at?: string | null
                    approved_by?: string | null
                    cid_code?: string | null
                    created_at?: string | null
                    created_by?: string | null
                    days_count?: number
                    doctor_name?: string | null
                    document_url?: string | null
                    end_date?: string
                    id?: string
                    reason?: string | null
                    server_id?: string
                    start_date?: string
                    type?: string
                    updated_at?: string | null
                }
            }
            daily_entries: {
                Row: {
                    break_time: unknown | null
                    created_at: string | null
                    worked_days: number | null
                    exit_time: string | null
                    id: string
                    day_of_week: number
                    location_lat: number | null
                    location_lng: number | null
                    notes: string | null
                    production: number | null
                    status: string | null
                    updated_at: string | null
                    weekly_record_id: string
                }
                Insert: {
                    break_time?: unknown | null
                    created_at?: string | null
                    worked_days?: number | null
                    exit_time?: string | null
                    id?: string
                    day_of_week: number
                    location_lat?: number | null
                    location_lng?: number | null
                    notes?: string | null
                    production?: number | null
                    status?: string | null
                    updated_at?: string | null
                    weekly_record_id: string
                }
                Update: {
                    break_time?: unknown | null
                    created_at?: string | null
                    worked_days?: number | null
                    exit_time?: string | null
                    id?: string
                    day_of_week?: number
                    location_lat?: number | null
                    location_lng?: number | null
                    notes?: string | null
                    production?: number | null
                    status?: string | null
                    updated_at?: string | null
                    weekly_record_id?: string
                }
            }
            notifications: {
                Row: {
                    action_url: string | null
                    category: string | null
                    created_at: string | null
                    id: string
                    is_read: boolean | null
                    message: string
                    read_at: string | null
                    related_entity_id: string | null
                    related_entity_type: string | null
                    title: string
                    type: string | null
                    user_id: string | null
                }
                Insert: {
                    action_url?: string | null
                    category?: string | null
                    created_at?: string | null
                    id?: string
                    is_read?: boolean | null
                    message: string
                    read_at?: string | null
                    related_entity_id?: string | null
                    related_entity_type?: string | null
                    title: string
                    type?: string | null
                    user_id?: string | null
                }
                Update: {
                    action_url?: string | null
                    category?: string | null
                    created_at?: string | null
                    id?: string
                    is_read?: boolean | null
                    message?: string
                    read_at?: string | null
                    related_entity_id?: string | null
                    related_entity_type?: string | null
                    title?: string
                    type?: string | null
                    user_id?: string | null
                }
            }
            servers: {
                Row: {
                    address: string | null
                    avatar_url: string | null
                    birth_date: string | null
                    city: string | null
                    cpf: string | null
                    created_at: string | null
                    email: string | null
                    hire_date: string | null
                    id: string
                    matricula: string
                    name: string
                    phone: string | null
                    role: string
                    status: string | null
                    supervisor_id: string | null
                    supervisor_geral_id: string | null
                    supervisor_area_id: string | null
                    updated_at: string | null
                    vinculo: string | null
                }
                Insert: {
                    address?: string | null
                    avatar_url?: string | null
                    birth_date?: string | null
                    city?: string | null
                    cpf?: string | null
                    created_at?: string | null
                    email?: string | null
                    hire_date?: string | null
                    id?: string
                    matricula: string
                    name: string
                    phone?: string | null
                    role: string
                    status?: string | null
                    supervisor_id?: string | null
                    supervisor_geral_id?: string | null
                    supervisor_area_id?: string | null
                    updated_at?: string | null
                    vinculo?: string | null
                }
                Update: {
                    address?: string | null
                    avatar_url?: string | null
                    birth_date?: string | null
                    city?: string | null
                    cpf?: string | null
                    created_at?: string | null
                    email?: string | null
                    hire_date?: string | null
                    id?: string
                    matricula?: string
                    name?: string
                    phone?: string | null
                    role?: string
                    status?: string | null
                    supervisor_id?: string | null
                    supervisor_geral_id?: string | null
                    supervisor_area_id?: string | null
                    updated_at?: string | null
                    vinculo?: string | null
                }
            }
            supervisors: {
                Row: {
                    avatar_url: string | null
                    created_at: string | null
                    id: string
                    is_active: boolean | null
                    name: string
                    phone: string | null
                    role: string
                    status: string | null
                    updated_at: string | null
                    user_id: string | null
                }
                Insert: {
                    avatar_url?: string | null
                    created_at?: string | null
                    id?: string
                    is_active?: boolean | null
                    name: string
                    phone?: string | null
                    role: string
                    status?: string | null
                    updated_at?: string | null
                    user_id?: string | null
                }
                Update: {
                    avatar_url?: string | null
                    created_at?: string | null
                    id?: string
                    is_active?: boolean | null
                    name?: string
                    phone?: string | null
                    role?: string
                    status?: string | null
                    updated_at?: string | null
                    user_id?: string | null
                }
            }
            users: {
                Row: {
                    auth_user_id: string | null
                    avatar_url: string | null
                    created_at: string | null
                    email: string
                    id: string
                    is_active: boolean | null
                    last_login_at: string | null
                    name: string
                    phone: string | null
                    role: string
                    supervisor_geral_id: string | null
                    supervisor_area_id: string | null
                    updated_at: string | null
                }
                Insert: {
                    auth_user_id?: string | null
                    avatar_url?: string | null
                    created_at?: string | null
                    email: string
                    id?: string
                    is_active?: boolean | null
                    last_login_at?: string | null
                    name: string
                    phone?: string | null
                    role: string
                    supervisor_geral_id?: string | null
                    supervisor_area_id?: string | null
                    updated_at?: string | null
                }
                Update: {
                    auth_user_id?: string | null
                    avatar_url?: string | null
                    created_at?: string | null
                    email?: string
                    id?: string
                    is_active?: boolean | null
                    last_login_at?: string | null
                    name?: string
                    phone?: string | null
                    role?: string
                    supervisor_geral_id?: string | null
                    supervisor_area_id?: string | null
                    updated_at?: string | null
                }
            }
            vacations: {
                Row: {
                    approved_at: string | null
                    approved_by: string | null
                    created_at: string | null
                    created_by: string | null
                    days_count: number
                    days_sold: number | null
                    id: string
                    notes: string | null
                    period_end: string
                    period_start: string
                    server_id: string
                    status: string | null
                    updated_at: string | null
                    year_reference: number
                }
                Insert: {
                    approved_at?: string | null
                    approved_by?: string | null
                    created_at?: string | null
                    created_by?: string | null
                    days_count: number
                    days_sold?: number | null
                    id?: string
                    notes?: string | null
                    period_end: string
                    period_start: string
                    server_id: string
                    status?: string | null
                    updated_at?: string | null
                    year_reference: number
                }
                Update: {
                    approved_at?: string | null
                    approved_by?: string | null
                    created_at?: string | null
                    created_by?: string | null
                    days_count?: number
                    days_sold?: number | null
                    id?: string
                    notes?: string | null
                    period_end?: string
                    period_start?: string
                    server_id?: string
                    status?: string | null
                    updated_at?: string | null
                    year_reference?: number
                }
            }
            weekly_records: {
                Row: {
                    approved_at: string | null
                    approved_by: string | null
                    created_at: string | null
                    created_by: string | null
                    id: string
                    notes: string | null
                    saturday_active: boolean | null
                    server_id: string
                    status: string | null
                    total_days_worked: number | null
                    total_production: number | null
                    updated_at: string | null
                    week_number: number
                    year: number
                }
                Insert: {
                    approved_at?: string | null
                    approved_by?: string | null
                    created_at?: string | null
                    created_by?: string | null
                    id?: string
                    notes?: string | null
                    saturday_active?: boolean | null
                    server_id: string
                    status?: string | null
                    total_days_worked?: number | null
                    total_production?: number | null
                    updated_at?: string | null
                    week_number: number
                    year: number
                }
                Update: {
                    approved_at?: string | null
                    approved_by?: string | null
                    created_at?: string | null
                    created_by?: string | null
                    id?: string
                    notes?: string | null
                    saturday_active?: boolean | null
                    server_id?: string
                    status?: string | null
                    total_days_worked?: number | null
                    total_production?: number | null
                    updated_at?: string | null
                    week_number?: number
                    year?: number
                }
            }
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            [_ in never]: never
        }
        Enums: {
            [_ in never]: never
        }
        CompositeTypes: {
            [_ in never]: never
        }
    }
}

// Helper types
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type InsertTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type UpdateTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']
