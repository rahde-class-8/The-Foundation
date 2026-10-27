
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "certifications": {
                  Row: {
                    "code": string,"created_at": string,"exam_guide_url": string | null,"exam_version": string,"id": string,"name": string,"status": string,"updated_at": string,"vendor": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"exam_guide_url"?: string | null,"exam_version": string,"id"?: string,"name": string,"status"?: string,"updated_at"?: string,"vendor": string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"exam_guide_url"?: string | null,"exam_version"?: string,"id"?: string,"name"?: string,"status"?: string,"updated_at"?: string,"vendor"?: string
                  }
                  Relationships: [
                    
                  ]
                },"concept_certifications": {
                  Row: {
                    "certification_id": string,"concept_id": string,"created_at": string,"exam_domain_id": string,"relevance": string
                  }
                  ComputedFields: never
                  Insert: {
                    "certification_id": string,"concept_id": string,"created_at"?: string,"exam_domain_id": string,"relevance"?: string
                  }
                  Update: {
                    "certification_id"?: string,"concept_id"?: string,"created_at"?: string,"exam_domain_id"?: string,"relevance"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "concept_certifications_concept_id_fkey"
      columns: ["concept_id"]
isOneToOne: false
      referencedRelation: "service_concepts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "concept_certifications_exam_domain_id_certification_id_fkey"
      columns: ["exam_domain_id","certification_id"]
isOneToOne: false
      referencedRelation: "exam_domains"
      referencedColumns: ["id","certification_id"]
    }
                  ]
                },"concept_revisions": {
                  Row: {
                    "concept_id": string,"created_at": string,"id": string,"published_by": string | null,"revision": number,"snapshot": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "concept_id": string,"created_at"?: string,"id"?: string,"published_by"?: string | null,"revision": number,"snapshot": NonNullable<Json>
                  }
                  Update: {
                    "concept_id"?: string,"created_at"?: string,"id"?: string,"published_by"?: string | null,"revision"?: number,"snapshot"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "concept_revisions_concept_id_fkey"
      columns: ["concept_id"]
isOneToOne: false
      referencedRelation: "service_concepts"
      referencedColumns: ["id"]
    }
                  ]
                },"concept_sources": {
                  Row: {
                    "concept_id": string,"created_at": string,"passage_id": string,"support_type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "concept_id": string,"created_at"?: string,"passage_id": string,"support_type": string
                  }
                  Update: {
                    "concept_id"?: string,"created_at"?: string,"passage_id"?: string,"support_type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "concept_sources_concept_id_fkey"
      columns: ["concept_id"]
isOneToOne: false
      referencedRelation: "service_concepts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "concept_sources_passage_id_fkey"
      columns: ["passage_id"]
isOneToOne: false
      referencedRelation: "source_passages"
      referencedColumns: ["id"]
    }
                  ]
                },"content_sources": {
                  Row: {
                    "byte_size": number | null,"catalog_key": string | null,"created_at": string,"id": string,"mime_type": string | null,"note_body_md": string | null,"owner_id": string,"page_count": number | null,"retrieved_at": string | null,"sha256": string | null,"source_type": string,"status": string,"storage_path": string | null,"title": string,"updated_at": string,"url": string | null,"visibility": string
                  }
                  ComputedFields: never
                  Insert: {
                    "byte_size"?: number | null,"catalog_key"?: string | null,"created_at"?: string,"id"?: string,"mime_type"?: string | null,"note_body_md"?: string | null,"owner_id": string,"page_count"?: number | null,"retrieved_at"?: string | null,"sha256"?: string | null,"source_type": string,"status"?: string,"storage_path"?: string | null,"title": string,"updated_at"?: string,"url"?: string | null,"visibility"?: string
                  }
                  Update: {
                    "byte_size"?: number | null,"catalog_key"?: string | null,"created_at"?: string,"id"?: string,"mime_type"?: string | null,"note_body_md"?: string | null,"owner_id"?: string,"page_count"?: number | null,"retrieved_at"?: string | null,"sha256"?: string | null,"source_type"?: string,"status"?: string,"storage_path"?: string | null,"title"?: string,"updated_at"?: string,"url"?: string | null,"visibility"?: string
                  }
                  Relationships: [
                    
                  ]
                },"exam_domains": {
                  Row: {
                    "certification_id": string,"code": string,"created_at": string,"id": string,"name": string,"sort_order": number,"updated_at": string,"weight_pct": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "certification_id": string,"code": string,"created_at"?: string,"id"?: string,"name": string,"sort_order"?: number,"updated_at"?: string,"weight_pct"?: number | null
                  }
                  Update: {
                    "certification_id"?: string,"code"?: string,"created_at"?: string,"id"?: string,"name"?: string,"sort_order"?: number,"updated_at"?: string,"weight_pct"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "exam_domains_certification_id_fkey"
      columns: ["certification_id"]
isOneToOne: false
      referencedRelation: "certifications"
      referencedColumns: ["id"]
    }
                  ]
                },"question_versions": {
                  Row: {
                    "content_hash": string,"created_at": string,"id": string,"prompt_md": string,"question_id": string,"reference_answer_md": string,"rubric": NonNullable<Json>,"rubric_schema_version": number,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "content_hash": string,"created_at"?: string,"id"?: string,"prompt_md": string,"question_id": string,"reference_answer_md": string,"rubric": NonNullable<Json>,"rubric_schema_version": number,"version": number
                  }
                  Update: {
                    "content_hash"?: string,"created_at"?: string,"id"?: string,"prompt_md"?: string,"question_id"?: string,"reference_answer_md"?: string,"rubric"?: NonNullable<Json>,"rubric_schema_version"?: number,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "question_versions_question_id_fkey"
      columns: ["question_id"]
isOneToOne: false
      referencedRelation: "questions"
      referencedColumns: ["id"]
    }
                  ]
                },"questions": {
                  Row: {
                    "concept_id": string,"created_at": string,"current_version_id": string | null,"difficulty": number,"dimension": string,"id": string,"key": string,"managed_by": string,"origin": string,"question_type": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "concept_id": string,"created_at"?: string,"current_version_id"?: string | null,"difficulty"?: number,"dimension": string,"id"?: string,"key": string,"managed_by"?: string,"origin"?: string,"question_type"?: string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "concept_id"?: string,"created_at"?: string,"current_version_id"?: string | null,"difficulty"?: number,"dimension"?: string,"id"?: string,"key"?: string,"managed_by"?: string,"origin"?: string,"question_type"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "questions_concept_id_fkey"
      columns: ["concept_id"]
isOneToOne: false
      referencedRelation: "service_concepts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "questions_current_version_fk"
      columns: ["current_version_id"]
isOneToOne: false
      referencedRelation: "question_versions"
      referencedColumns: ["id"]
    }
                  ]
                },"review_state": {
                  Row: {
                    "concept_id": string,"config_version": string | null,"consecutive_cold_passes": number,"created_at": string,"due_at": string | null,"ease": number,"first_studied_at": string | null,"id": string,"interval_days": number,"is_active": boolean,"lapse_count": number,"last_cold_grade": string | null,"last_exposure_at": string | null,"last_reviewed_at": string | null,"manual_due_override": boolean,"mastery_status": string,"pre_lapse_interval_days": number | null,"total_cold_attempts": number,"updated_at": string,"user_id": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "concept_id": string,"config_version"?: string | null,"consecutive_cold_passes"?: number,"created_at"?: string,"due_at"?: string | null,"ease"?: number,"first_studied_at"?: string | null,"id"?: string,"interval_days"?: number,"is_active"?: boolean,"lapse_count"?: number,"last_cold_grade"?: string | null,"last_exposure_at"?: string | null,"last_reviewed_at"?: string | null,"manual_due_override"?: boolean,"mastery_status"?: string,"pre_lapse_interval_days"?: number | null,"total_cold_attempts"?: number,"updated_at"?: string,"user_id": string,"version"?: number
                  }
                  Update: {
                    "concept_id"?: string,"config_version"?: string | null,"consecutive_cold_passes"?: number,"created_at"?: string,"due_at"?: string | null,"ease"?: number,"first_studied_at"?: string | null,"id"?: string,"interval_days"?: number,"is_active"?: boolean,"lapse_count"?: number,"last_cold_grade"?: string | null,"last_exposure_at"?: string | null,"last_reviewed_at"?: string | null,"manual_due_override"?: boolean,"mastery_status"?: string,"pre_lapse_interval_days"?: number | null,"total_cold_attempts"?: number,"updated_at"?: string,"user_id"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "review_state_concept_id_fkey"
      columns: ["concept_id"]
isOneToOne: false
      referencedRelation: "service_concepts"
      referencedColumns: ["id"]
    }
                  ]
                },"service_categories": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"slug": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"slug": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"slug"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"service_concepts": {
                  Row: {
                    "created_at": string,"examples_md": string | null,"explanation_md": string | null,"id": string,"limitations_md": string | null,"managed_by": string,"origin": string,"owner_id": string,"published_at": string | null,"revision": number,"search_tsv": unknown,"service_id": string,"slug": string,"sort_order": number,"status": string,"summary_md": string | null,"title": string,"updated_at": string,"visibility": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"examples_md"?: string | null,"explanation_md"?: string | null,"id"?: string,"limitations_md"?: string | null,"managed_by"?: string,"origin"?: string,"owner_id": string,"published_at"?: string | null,"revision"?: number,"search_tsv"?: unknown,"service_id": string,"slug": string,"sort_order"?: number,"status"?: string,"summary_md"?: string | null,"title": string,"updated_at"?: string,"visibility"?: string
                  }
                  Update: {
                    "created_at"?: string,"examples_md"?: string | null,"explanation_md"?: string | null,"id"?: string,"limitations_md"?: string | null,"managed_by"?: string,"origin"?: string,"owner_id"?: string,"published_at"?: string | null,"revision"?: number,"search_tsv"?: unknown,"service_id"?: string,"slug"?: string,"sort_order"?: number,"status"?: string,"summary_md"?: string | null,"title"?: string,"updated_at"?: string,"visibility"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "service_concepts_service_id_fkey"
      columns: ["service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id"]
    }
                  ]
                },"service_relationships": {
                  Row: {
                    "created_at": string,"from_service_id": string,"note_md": string | null,"relation": string,"to_service_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"from_service_id": string,"note_md"?: string | null,"relation": string,"to_service_id": string
                  }
                  Update: {
                    "created_at"?: string,"from_service_id"?: string,"note_md"?: string | null,"relation"?: string,"to_service_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "service_relationships_from_service_id_fkey"
      columns: ["from_service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "service_relationships_to_service_id_fkey"
      columns: ["to_service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["id"]
    }
                  ]
                },"services": {
                  Row: {
                    "aliases": (string)[],"architecture_placement_md": string | null,"category_id": string,"cloud_provider": string,"created_at": string,"docs_url": string | null,"does_not_do_md": string | null,"how_it_solves_md": string | null,"how_it_works_md": string | null,"id": string,"managed_by": string,"name": string,"origin": string,"problem_solved_md": string | null,"search_tsv": unknown,"slug": string,"status": string,"summary_md": string | null,"trade_offs_md": string | null,"updated_at": string,"what_it_is_md": string | null,"when_to_choose_md": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "aliases"?: (string)[],"architecture_placement_md"?: string | null,"category_id": string,"cloud_provider"?: string,"created_at"?: string,"docs_url"?: string | null,"does_not_do_md"?: string | null,"how_it_solves_md"?: string | null,"how_it_works_md"?: string | null,"id"?: string,"managed_by"?: string,"name": string,"origin"?: string,"problem_solved_md"?: string | null,"search_tsv"?: unknown,"slug": string,"status"?: string,"summary_md"?: string | null,"trade_offs_md"?: string | null,"updated_at"?: string,"what_it_is_md"?: string | null,"when_to_choose_md"?: string | null
                  }
                  Update: {
                    "aliases"?: (string)[],"architecture_placement_md"?: string | null,"category_id"?: string,"cloud_provider"?: string,"created_at"?: string,"docs_url"?: string | null,"does_not_do_md"?: string | null,"how_it_solves_md"?: string | null,"how_it_works_md"?: string | null,"id"?: string,"managed_by"?: string,"name"?: string,"origin"?: string,"problem_solved_md"?: string | null,"search_tsv"?: unknown,"slug"?: string,"status"?: string,"summary_md"?: string | null,"trade_offs_md"?: string | null,"updated_at"?: string,"what_it_is_md"?: string | null,"when_to_choose_md"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "services_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "service_categories"
      referencedColumns: ["id"]
    }
                  ]
                },"source_passages": {
                  Row: {
                    "char_end": number | null,"char_start": number | null,"created_at": string,"excerpt_kind": string,"id": string,"ordinal": number,"page_end": number | null,"page_start": number | null,"search_tsv": unknown,"section_path": string | null,"source_id": string,"text": string,"text_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "char_end"?: number | null,"char_start"?: number | null,"created_at"?: string,"excerpt_kind"?: string,"id"?: string,"ordinal": number,"page_end"?: number | null,"page_start"?: number | null,"search_tsv"?: never,"section_path"?: string | null,"source_id": string,"text": string,"text_hash": string
                  }
                  Update: {
                    "char_end"?: number | null,"char_start"?: number | null,"created_at"?: string,"excerpt_kind"?: string,"id"?: string,"ordinal"?: number,"page_end"?: number | null,"page_start"?: number | null,"search_tsv"?: never,"section_path"?: string | null,"source_id"?: string,"text"?: string,"text_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "source_passages_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "content_sources"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "catalog_facets":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"import_catalog":
{ Args: { "p_catalog": Json,"p_owner_id": string }; Returns: Json
                           },
"mark_concept_exposed":
{ Args: { "concept_id": string }; Returns: undefined
                           },
"search_catalog":
{ Args: { "after"?: string,"category_id"?: string,"domain_id"?: string,"page_size"?: number,"q"?: string }; Returns: Json
                           },
"service_profile":
{ Args: { "provider"?: string,"service_slug": string }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
