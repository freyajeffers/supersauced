export interface OnboardingSurvey {
  dietary_preferences?: string[];
  [key: string]: any;
}

export interface SauceLog {
  inventory?: {
    [sku: string]: {
      quantity: number;
      last_updated: string;
    };
  };
  subscription?: {
    is_active: boolean;
    entitlement_id: string | null;
    product_id: string | null;
    event_type: string;
    expiration_at_ms: number | null;
    last_webhook_received_at: string;
  };
}

export interface UserProfile {
  id: string;
  email: string;
  username?: string;
  full_name?: string;
  avatar_url?: string;
  onboarding_survey: OnboardingSurvey;
  sauce_log: SauceLog;
  created_at: string;
  updated_at: string;
}

export interface SignUpRequest {
  email: string;
  password?: string;
  username?: string;
  full_name?: string;
  avatar_url?: string;
  onboarding_survey?: OnboardingSurvey;
  sauce_log?: SauceLog;
}

export interface LoginRequest {
  email: string;
  password?: string;
}

export interface UserSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export interface UserDetail {
  id: string;
  email: string;
  username?: string;
  full_name?: string;
  avatar_url?: string;
}

export interface AuthResponse {
  session: UserSession;
  user: UserDetail;
}

export interface CurrentUser {
  id: string;
  email: string;
  role: string;
}

export interface Recipe {
  id: string;
  title: string;
  slug: string;
  description?: string;
  hero_image_url?: string;
  difficulty: number;
  cook_time_minutes?: number;
  calories_per_serving?: number;
  protein_g?: number;
  fat_g?: number;
  carbs_g?: number;
  cube_tags: string[];
  dietary_tags: string[];
  servings_default?: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface RecipeCreate {
  title: string;
  slug: string;
  description?: string;
  hero_image_url?: string;
  difficulty: number;
  cook_time_minutes?: number;
  calories_per_serving?: number;
  protein_g?: number;
  fat_g?: number;
  carbs_g?: number;
  cube_tags?: string[];
  dietary_tags?: string[];
  servings_default?: number;
  is_published?: boolean;
}

export interface RecipeUpdate {
  title?: string;
  slug?: string;
  description?: string;
  hero_image_url?: string;
  difficulty?: number;
  cook_time_minutes?: number;
  calories_per_serving?: number;
  protein_g?: number;
  fat_g?: number;
  carbs_g?: number;
  cube_tags?: string[];
  dietary_tags?: string[];
  servings_default?: number;
  is_published?: boolean;
}

export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  quantity: number;
  unit?: string;
  name: string;
  notes?: string;
  position?: number;
}

export interface RecipeIngredientCreate {
  recipe_id: string;
  quantity: number;
  unit?: string;
  name: string;
  notes?: string;
  position?: number;
}

export interface RecipeIngredientUpdate {
  recipe_id?: string;
  quantity?: number;
  unit?: string;
  name?: string;
  notes?: string;
  position?: number;
}

export interface RecipeStep {
  id: string;
  recipe_id: string;
  step_number: number;
  description: string;
  video_url?: string;
  timer_seconds?: number;
  tip?: string;
}

export interface RecipeStepCreate {
  recipe_id: string;
  step_number: number;
  description: string;
  video_url?: string;
  timer_seconds?: number;
  tip?: string;
}

export interface RecipeStepUpdate {
  recipe_id?: string;
  step_number?: number;
  description?: string;
  video_url?: string;
  timer_seconds?: number;
  tip?: string;
}

export interface Subscription {
  id: string;
  name: string;
  price: number;
  cadence: string;
  features: string[];
  revenuecat_product_id: string;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionCreate {
  name: string;
  price: number;
  cadence: string;
  features?: string[];
  revenuecat_product_id: string;
}

export interface SubscriptionUpdate {
  name?: string;
  price?: number;
  cadence?: string;
  features?: string[];
  revenuecat_product_id?: string;
}
