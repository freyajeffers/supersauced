export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      categories: {
        Row: {
          id: string
          name: string
          parent_id: string | null
        }
        Insert: {
          id?: string
          name: string
          parent_id?: string | null
        }
        Update: {
          id?: string
          name?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      dietary_tags: {
        Row: {
          id: string
          is_allergen: boolean | null
          name: string
        }
        Insert: {
          id?: string
          is_allergen?: boolean | null
          name: string
        }
        Update: {
          id?: string
          is_allergen?: boolean | null
          name?: string
        }
        Relationships: []
      }
      ingredients: {
        Row: {
          default_unit_id: string | null
          id: string
          name: string
        }
        Insert: {
          default_unit_id?: string | null
          id?: string
          name: string
        }
        Update: {
          default_unit_id?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredients_default_unit_id_fkey"
            columns: ["default_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      instruction_steps: {
        Row: {
          id: string
          instruction_text: string
          is_active_cooking: boolean | null
          recipe_id: string | null
          step_number: number
          timer_seconds: number | null
        }
        Insert: {
          id?: string
          instruction_text: string
          is_active_cooking?: boolean | null
          recipe_id?: string | null
          step_number: number
          timer_seconds?: number | null
        }
        Update: {
          id?: string
          instruction_text?: string
          is_active_cooking?: boolean | null
          recipe_id?: string | null
          step_number?: number
          timer_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "instruction_steps_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe_details_materialized"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instruction_steps_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      product_media: {
        Row: {
          file_path: string | null
          id: string
          is_primary: boolean | null
          product_id: string | null
        }
        Insert: {
          file_path?: string | null
          id?: string
          is_primary?: boolean | null
          product_id?: string | null
        }
        Update: {
          file_path?: string | null
          id?: string
          is_primary?: boolean | null
          product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_media_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_nutrition: {
        Row: {
          calories: number | null
          carbs_g: number | null
          fat_g: number | null
          product_id: string
          protein_g: number | null
          serving_size_grams: number | null
        }
        Insert: {
          calories?: number | null
          carbs_g?: number | null
          fat_g?: number | null
          product_id: string
          protein_g?: number | null
          serving_size_grams?: number | null
        }
        Update: {
          calories?: number | null
          carbs_g?: number | null
          fat_g?: number | null
          product_id?: string
          protein_g?: number | null
          serving_size_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_nutrition_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          description: string | null
          flavor_profile: string | null
          id: string
          is_active: boolean | null
          name: string
          sku: string
        }
        Insert: {
          description?: string | null
          flavor_profile?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          sku: string
        }
        Update: {
          description?: string | null
          flavor_profile?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          sku?: string
        }
        Relationships: []
      }
      recipe_categories: {
        Row: {
          category_id: string
          recipe_id: string
        }
        Insert: {
          category_id: string
          recipe_id: string
        }
        Update: {
          category_id?: string
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_categories_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe_details_materialized"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_categories_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ingredients: {
        Row: {
          id: string
          ingredient_id: string | null
          preparation_state: string | null
          quantity_decimal: number | null
          quantity_denominator: number | null
          quantity_numerator: number | null
          recipe_id: string | null
          unit_id: string | null
        }
        Insert: {
          id?: string
          ingredient_id?: string | null
          preparation_state?: string | null
          quantity_decimal?: number | null
          quantity_denominator?: number | null
          quantity_numerator?: number | null
          recipe_id?: string | null
          unit_id?: string | null
        }
        Update: {
          id?: string
          ingredient_id?: string | null
          preparation_state?: string | null
          quantity_decimal?: number | null
          quantity_denominator?: number | null
          quantity_numerator?: number | null
          recipe_id?: string | null
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe_details_materialized"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_metrics: {
        Row: {
          cook_time_seconds: number | null
          difficulty_level: string | null
          prep_time_seconds: number | null
          recipe_id: string
          servings: number | null
        }
        Insert: {
          cook_time_seconds?: number | null
          difficulty_level?: string | null
          prep_time_seconds?: number | null
          recipe_id: string
          servings?: number | null
        }
        Update: {
          cook_time_seconds?: number | null
          difficulty_level?: string | null
          prep_time_seconds?: number | null
          recipe_id?: string
          servings?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_metrics_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: true
            referencedRelation: "recipe_details_materialized"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_metrics_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: true
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_products: {
        Row: {
          id: string
          product_id: string | null
          quantity: number | null
          recipe_id: string | null
        }
        Insert: {
          id?: string
          product_id?: string | null
          quantity?: number | null
          recipe_id?: string | null
        }
        Update: {
          id?: string
          product_id?: string | null
          quantity?: number | null
          recipe_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_products_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe_details_materialized"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_products_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          author_id: string | null
          description: string | null
          id: string
          published_at: string | null
          search_vector: unknown
          slug: string
          status: string | null
          title: string
        }
        Insert: {
          author_id?: string | null
          description?: string | null
          id?: string
          published_at?: string | null
          search_vector?: unknown
          slug: string
          status?: string | null
          title: string
        }
        Update: {
          author_id?: string | null
          description?: string | null
          id?: string
          published_at?: string | null
          search_vector?: unknown
          slug?: string
          status?: string | null
          title?: string
        }
        Relationships: []
      }
      saved_recipes: {
        Row: {
          collection_name: string | null
          recipe_id: string
          saved_at: string | null
          user_id: string
        }
        Insert: {
          collection_name?: string | null
          recipe_id: string
          saved_at?: string | null
          user_id: string
        }
        Update: {
          collection_name?: string | null
          recipe_id?: string
          saved_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_recipes_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe_details_materialized"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_recipes_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_list_items: {
        Row: {
          id: string
          ingredient_id: string | null
          is_checked_off: boolean | null
          product_id: string | null
          quantity: number | null
          shopping_list_id: string | null
          unit_id: string | null
        }
        Insert: {
          id?: string
          ingredient_id?: string | null
          is_checked_off?: boolean | null
          product_id?: string | null
          quantity?: number | null
          shopping_list_id?: string | null
          unit_id?: string | null
        }
        Update: {
          id?: string
          ingredient_id?: string | null
          is_checked_off?: boolean | null
          product_id?: string | null
          quantity?: number | null
          shopping_list_id?: string | null
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_items_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_shopping_list_id_fkey"
            columns: ["shopping_list_id"]
            isOneToOne: false
            referencedRelation: "shopping_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_lists: {
        Row: {
          created_at: string | null
          id: string
          is_completed: boolean | null
          name: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_completed?: boolean | null
          name: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_completed?: boolean | null
          name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      step_media: {
        Row: {
          file_path: string
          step_id: string
        }
        Insert: {
          file_path: string
          step_id: string
        }
        Update: {
          file_path?: string
          step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "step_media_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "instruction_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          abbreviation: string | null
          id: string
          name: string
        }
        Insert: {
          abbreviation?: string | null
          id?: string
          name: string
        }
        Update: {
          abbreviation?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      user_dietary_prefs: {
        Row: {
          dietary_tag_id: string
          user_id: string
        }
        Insert: {
          dietary_tag_id: string
          user_id: string
        }
        Update: {
          dietary_tag_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_dietary_prefs_dietary_tag_id_fkey"
            columns: ["dietary_tag_id"]
            isOneToOne: false
            referencedRelation: "dietary_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_path: string | null
          bio: string | null
          email: string | null
          first_name: string | null
          last_name: string | null
          user_id: string
        }
        Insert: {
          avatar_path?: string | null
          bio?: string | null
          email?: string | null
          first_name?: string | null
          last_name?: string | null
          user_id: string
        }
        Update: {
          avatar_path?: string | null
          bio?: string | null
          email?: string | null
          first_name?: string | null
          last_name?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          measurement_system: string | null
          newsletter: boolean | null
          push_notifications: boolean | null
          user_id: string
        }
        Insert: {
          measurement_system?: string | null
          newsletter?: boolean | null
          push_notifications?: boolean | null
          user_id: string
        }
        Update: {
          measurement_system?: string | null
          newsletter?: boolean | null
          push_notifications?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      recipe_details_materialized: {
        Row: {
          author_id: string | null
          cook_time_seconds: number | null
          description: string | null
          difficulty_level: string | null
          id: string | null
          ingredients: Json | null
          prep_time_seconds: number | null
          published_at: string | null
          servings: number | null
          slug: string | null
          status: string | null
          steps: Json | null
          title: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_recipe_to_shopping_list: {
        Args: { p_recipe_id: string; p_user_id: string }
        Returns: undefined
      }
      consolidate_shopping_list: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      create_test_user: {
        Args: { p_email: string; p_id: string }
        Returns: undefined
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

