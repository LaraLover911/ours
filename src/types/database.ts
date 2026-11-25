
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
            "activity_events": {
                  Row: {
                    "created_at": string,"id": string,"kind": string,"ref_id": string | null,"summary": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"kind": string,"ref_id"?: string | null,"summary": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"kind"?: string,"ref_id"?: string | null,"summary"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "activity_events_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"calls": {
                  Row: {
                    "accepted_at": string | null,"callee_id": string,"caller_id": string,"connected_at": string | null,"created_at": string,"end_reason": string | null,"ended_at": string | null,"id": string,"kind": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"callee_id": string,"caller_id"?: string,"connected_at"?: string | null,"created_at"?: string,"end_reason"?: string | null,"ended_at"?: string | null,"id": string,"kind": string,"status"?: string
                  }
                  Update: {
                    "accepted_at"?: string | null,"callee_id"?: string,"caller_id"?: string,"connected_at"?: string | null,"created_at"?: string,"end_reason"?: string | null,"ended_at"?: string | null,"id"?: string,"kind"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "calls_callee_id_fkey"
      columns: ["callee_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "calls_caller_id_fkey"
      columns: ["caller_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"clip_likes": {
                  Row: {
                    "clip_id": string,"created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "clip_id": string,"created_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "clip_id"?: string,"created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clip_likes_clip_id_fkey"
      columns: ["clip_id"]
isOneToOne: false
      referencedRelation: "clips"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clip_likes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"clips": {
                  Row: {
                    "author_id": string,"caption": string | null,"created_at": string,"duration": number | null,"height": number | null,"id": string,"video_path": string,"width": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string,"caption"?: string | null,"created_at"?: string,"duration"?: number | null,"height"?: number | null,"id"?: string,"video_path": string,"width"?: number | null
                  }
                  Update: {
                    "author_id"?: string,"caption"?: string | null,"created_at"?: string,"duration"?: number | null,"height"?: number | null,"id"?: string,"video_path"?: string,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "clips_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"conversation_reads": {
                  Row: {
                    "conversation_id": string,"last_read_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "conversation_id": string,"last_read_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "conversation_id"?: string,"last_read_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversation_reads_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversation_reads_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"conversations": {
                  Row: {
                    "created_at": string,"created_by": string | null,"emoji": string | null,"id": string,"is_default": boolean,"last_message_at": string | null,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"emoji"?: string | null,"id"?: string,"is_default"?: boolean,"last_message_at"?: string | null,"title": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"emoji"?: string | null,"id"?: string,"is_default"?: boolean,"last_message_at"?: string | null,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversations_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"couple_settings": {
                  Row: {
                    "background_image": string | null,"hero_image": string | null,"home_message": string | null,"home_message_by": string | null,"id": number,"spotify_playlist_url": string | null,"start_date": string | null,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "background_image"?: string | null,"hero_image"?: string | null,"home_message"?: string | null,"home_message_by"?: string | null,"id"?: number,"spotify_playlist_url"?: string | null,"start_date"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "background_image"?: string | null,"hero_image"?: string | null,"home_message"?: string | null,"home_message_by"?: string | null,"id"?: number,"spotify_playlist_url"?: string | null,"start_date"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "couple_settings_home_message_by_fkey"
      columns: ["home_message_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "couple_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"daily_questions": {
                  Row: {
                    "added_by": string | null,"created_at": string,"id": number,"question": string
                  }
                  ComputedFields: never
                  Insert: {
                    "added_by"?: string | null,"created_at"?: string,"id"?: never,"question": string
                  }
                  Update: {
                    "added_by"?: string | null,"created_at"?: string,"id"?: never,"question"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "daily_questions_added_by_fkey"
      columns: ["added_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"date_ideas": {
                  Row: {
                    "category": string,"created_at": string,"created_by": string,"description": string | null,"id": string,"is_favorite": boolean,"link": string | null,"location": string | null,"planned_for": string | null,"reminder": boolean,"status": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category"?: string,"created_at"?: string,"created_by"?: string,"description"?: string | null,"id"?: string,"is_favorite"?: boolean,"link"?: string | null,"location"?: string | null,"planned_for"?: string | null,"reminder"?: boolean,"status"?: string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "category"?: string,"created_at"?: string,"created_by"?: string,"description"?: string | null,"id"?: string,"is_favorite"?: boolean,"link"?: string | null,"location"?: string | null,"planned_for"?: string | null,"reminder"?: boolean,"status"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "date_ideas_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"date_votes": {
                  Row: {
                    "created_at": string,"idea_id": string,"user_id": string,"value": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"idea_id": string,"user_id"?: string,"value": number
                  }
                  Update: {
                    "created_at"?: string,"idea_id"?: string,"user_id"?: string,"value"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "date_votes_idea_id_fkey"
      columns: ["idea_id"]
isOneToOne: false
      referencedRelation: "date_ideas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "date_votes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"device_sessions": {
                  Row: {
                    "app_version": string | null,"battery_charging": boolean | null,"battery_level": number | null,"browser": string | null,"browser_version": string | null,"connection": string | null,"created_at": string,"device_type": string,"ended_at": string | null,"id": string,"last_heartbeat_at": string,"name": string,"os": string | null,"os_version": string | null,"pwa": boolean | null,"screen": string | null,"share": NonNullable<Json>,"user_id": string,"viewport": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "app_version"?: string | null,"battery_charging"?: boolean | null,"battery_level"?: number | null,"browser"?: string | null,"browser_version"?: string | null,"connection"?: string | null,"created_at"?: string,"device_type"?: string,"ended_at"?: string | null,"id": string,"last_heartbeat_at"?: string,"name"?: string,"os"?: string | null,"os_version"?: string | null,"pwa"?: boolean | null,"screen"?: string | null,"share"?: NonNullable<Json>,"user_id"?: string,"viewport"?: string | null
                  }
                  Update: {
                    "app_version"?: string | null,"battery_charging"?: boolean | null,"battery_level"?: number | null,"browser"?: string | null,"browser_version"?: string | null,"connection"?: string | null,"created_at"?: string,"device_type"?: string,"ended_at"?: string | null,"id"?: string,"last_heartbeat_at"?: string,"name"?: string,"os"?: string | null,"os_version"?: string | null,"pwa"?: boolean | null,"screen"?: string | null,"share"?: NonNullable<Json>,"user_id"?: string,"viewport"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "device_sessions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"diary_comments": {
                  Row: {
                    "author_id": string,"body": string,"created_at": string,"entry_id": string,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string,"body": string,"created_at"?: string,"entry_id": string,"id"?: string
                  }
                  Update: {
                    "author_id"?: string,"body"?: string,"created_at"?: string,"entry_id"?: string,"id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "diary_comments_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "diary_comments_entry_id_fkey"
      columns: ["entry_id"]
isOneToOne: false
      referencedRelation: "diary_entries"
      referencedColumns: ["id"]
    }
                  ]
                },"diary_entries": {
                  Row: {
                    "author_id": string,"body": string,"created_at": string,"entry_at": string,"id": string,"image_paths": (string)[],"mood": string | null,"title": string | null,"updated_at": string,"visibility": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string,"body": string,"created_at"?: string,"entry_at"?: string,"id"?: string,"image_paths"?: (string)[],"mood"?: string | null,"title"?: string | null,"updated_at"?: string,"visibility"?: string
                  }
                  Update: {
                    "author_id"?: string,"body"?: string,"created_at"?: string,"entry_at"?: string,"id"?: string,"image_paths"?: (string)[],"mood"?: string | null,"title"?: string | null,"updated_at"?: string,"visibility"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "diary_entries_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"game_responses": {
                  Row: {
                    "created_at": string,"game": string,"prompt_key": string,"user_id": string,"value": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"game": string,"prompt_key": string,"user_id"?: string,"value": string
                  }
                  Update: {
                    "created_at"?: string,"game"?: string,"prompt_key"?: string,"user_id"?: string,"value"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "game_responses_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"game_scores": {
                  Row: {
                    "created_at": string,"game": string,"id": string,"score": number,"total": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"game": string,"id"?: string,"score": number,"total": number,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"game"?: string,"id"?: string,"score"?: number,"total"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "game_scores_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"integration_connections": {
                  Row: {
                    "account_label": string | null,"connected_at": string,"last_error": string | null,"provider": string,"scopes": (string)[],"status": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_label"?: string | null,"connected_at"?: string,"last_error"?: string | null,"provider": string,"scopes"?: (string)[],"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "account_label"?: string | null,"connected_at"?: string,"last_error"?: string | null,"provider"?: string,"scopes"?: (string)[],"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "integration_connections_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"integration_tokens": {
                  Row: {
                    "ciphertext": string,"expires_at": string | null,"provider": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ciphertext": string,"expires_at"?: string | null,"provider": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "ciphertext"?: string,"expires_at"?: string | null,"provider"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "integration_tokens_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "integration_tokens_user_id_provider_fkey"
      columns: ["user_id","provider"]
isOneToOne: true
      referencedRelation: "integration_connections"
      referencedColumns: ["user_id","provider"]
    }
                  ]
                },"invites": {
                  Row: {
                    "accepted_at": string | null,"created_at": string,"display_name": string,"email": string,"role": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"created_at"?: string,"display_name": string,"email": string,"role": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"created_at"?: string,"display_name"?: string,"email"?: string,"role"?: string
                  }
                  Relationships: [
                    
                  ]
                },"love_letters": {
                  Row: {
                    "author_id": string,"body": string,"category": string,"created_at": string,"id": string,"image_path": string | null,"open_at": string | null,"opened_at": string | null,"recipient_id": string | null,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string,"body": string,"category": string,"created_at"?: string,"id"?: string,"image_path"?: string | null,"open_at"?: string | null,"opened_at"?: string | null,"recipient_id"?: string | null,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "author_id"?: string,"body"?: string,"category"?: string,"created_at"?: string,"id"?: string,"image_path"?: string | null,"open_at"?: string | null,"opened_at"?: string | null,"recipient_id"?: string | null,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "love_letters_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "love_letters_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"memories": {
                  Row: {
                    "category": string,"created_at": string,"created_by": string,"description": string | null,"happened_on": string | null,"id": string,"is_favorite": boolean,"location": string | null,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category"?: string,"created_at"?: string,"created_by"?: string,"description"?: string | null,"happened_on"?: string | null,"id"?: string,"is_favorite"?: boolean,"location"?: string | null,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "category"?: string,"created_at"?: string,"created_by"?: string,"description"?: string | null,"happened_on"?: string | null,"id"?: string,"is_favorite"?: boolean,"location"?: string | null,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "memories_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"memory_comments": {
                  Row: {
                    "author_id": string,"body": string,"created_at": string,"id": string,"memory_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string,"body": string,"created_at"?: string,"id"?: string,"memory_id": string
                  }
                  Update: {
                    "author_id"?: string,"body"?: string,"created_at"?: string,"id"?: string,"memory_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "memory_comments_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "memory_comments_memory_id_fkey"
      columns: ["memory_id"]
isOneToOne: false
      referencedRelation: "memories"
      referencedColumns: ["id"]
    }
                  ]
                },"memory_media": {
                  Row: {
                    "created_at": string,"created_by": string,"height": number | null,"id": string,"kind": string,"memory_id": string,"path": string,"position": number,"width": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string,"height"?: number | null,"id"?: string,"kind": string,"memory_id": string,"path": string,"position"?: number,"width"?: number | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"height"?: number | null,"id"?: string,"kind"?: string,"memory_id"?: string,"path"?: string,"position"?: number,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "memory_media_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "memory_media_memory_id_fkey"
      columns: ["memory_id"]
isOneToOne: false
      referencedRelation: "memories"
      referencedColumns: ["id"]
    }
                  ]
                },"message_reactions": {
                  Row: {
                    "created_at": string,"emoji": string,"message_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"emoji": string,"message_id": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"emoji"?: string,"message_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "message_reactions_message_id_fkey"
      columns: ["message_id"]
isOneToOne: false
      referencedRelation: "messages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "message_reactions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"messages": {
                  Row: {
                    "attachment_meta": NonNullable<Json>,"attachment_path": string | null,"body": string | null,"conversation_id": string,"created_at": string,"deleted_at": string | null,"edited_at": string | null,"id": string,"kind": string,"reply_to_id": string | null,"sender_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attachment_meta"?: NonNullable<Json>,"attachment_path"?: string | null,"body"?: string | null,"conversation_id": string,"created_at"?: string,"deleted_at"?: string | null,"edited_at"?: string | null,"id"?: string,"kind"?: string,"reply_to_id"?: string | null,"sender_id"?: string
                  }
                  Update: {
                    "attachment_meta"?: NonNullable<Json>,"attachment_path"?: string | null,"body"?: string | null,"conversation_id"?: string,"created_at"?: string,"deleted_at"?: string | null,"edited_at"?: string | null,"id"?: string,"kind"?: string,"reply_to_id"?: string | null,"sender_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_reply_to_id_fkey"
      columns: ["reply_to_id"]
isOneToOne: false
      referencedRelation: "messages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_prefs": {
                  Row: {
                    "categories": NonNullable<Json>,"previews": boolean,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "categories"?: NonNullable<Json>,"previews"?: boolean,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "categories"?: NonNullable<Json>,"previews"?: boolean,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_prefs_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"pops": {
                  Row: {
                    "body": string | null,"created_at": string,"id": string,"kind": string,"media_path": string | null,"recipient_id": string,"scream": boolean,"sender_id": string,"shown_at": string | null,"teaser": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"id"?: string,"kind": string,"media_path"?: string | null,"recipient_id": string,"scream"?: boolean,"sender_id"?: string,"shown_at"?: string | null,"teaser"?: string | null
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"id"?: string,"kind"?: string,"media_path"?: string | null,"recipient_id"?: string,"scream"?: boolean,"sender_id"?: string,"shown_at"?: string | null,"teaser"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "pops_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pops_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "accent": string,"avatar_path": string | null,"bio": string | null,"created_at": string,"display_name": string,"id": string,"last_activity": string | null,"last_activity_at": string | null,"last_seen_at": string | null,"notify_messages": boolean,"read_receipts": boolean,"role": string,"share_activity": boolean,"share_activity_feed": boolean,"show_online": boolean,"theme": string,"today_thought": string | null,"today_thought_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accent"?: string,"avatar_path"?: string | null,"bio"?: string | null,"created_at"?: string,"display_name": string,"id": string,"last_activity"?: string | null,"last_activity_at"?: string | null,"last_seen_at"?: string | null,"notify_messages"?: boolean,"read_receipts"?: boolean,"role": string,"share_activity"?: boolean,"share_activity_feed"?: boolean,"show_online"?: boolean,"theme"?: string,"today_thought"?: string | null,"today_thought_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "accent"?: string,"avatar_path"?: string | null,"bio"?: string | null,"created_at"?: string,"display_name"?: string,"id"?: string,"last_activity"?: string | null,"last_activity_at"?: string | null,"last_seen_at"?: string | null,"notify_messages"?: boolean,"read_receipts"?: boolean,"role"?: string,"share_activity"?: boolean,"share_activity_feed"?: boolean,"show_online"?: boolean,"theme"?: string,"today_thought"?: string | null,"today_thought_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"push_config": {
                  Row: {
                    "function_url": string | null,"id": number,"vapid_private": string | null,"vapid_public": string | null,"vapid_subject": string | null,"webhook_secret": string
                  }
                  ComputedFields: never
                  Insert: {
                    "function_url"?: string | null,"id"?: number,"vapid_private"?: string | null,"vapid_public"?: string | null,"vapid_subject"?: string | null,"webhook_secret"?: string
                  }
                  Update: {
                    "function_url"?: string | null,"id"?: number,"vapid_private"?: string | null,"vapid_public"?: string | null,"vapid_subject"?: string | null,"webhook_secret"?: string
                  }
                  Relationships: [
                    
                  ]
                },"push_log": {
                  Row: {
                    "created_at": string,"event_key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"event_key": string
                  }
                  Update: {
                    "created_at"?: string,"event_key"?: string
                  }
                  Relationships: [
                    
                  ]
                },"push_subscriptions": {
                  Row: {
                    "auth": string,"created_at": string,"device_id": string | null,"endpoint": string,"failures": number,"id": string,"label": string | null,"last_error": string | null,"last_success_at": string | null,"p256dh": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auth": string,"created_at"?: string,"device_id"?: string | null,"endpoint": string,"failures"?: number,"id"?: string,"label"?: string | null,"last_error"?: string | null,"last_success_at"?: string | null,"p256dh": string,"user_id"?: string
                  }
                  Update: {
                    "auth"?: string,"created_at"?: string,"device_id"?: string | null,"endpoint"?: string,"failures"?: number,"id"?: string,"label"?: string | null,"last_error"?: string | null,"last_success_at"?: string | null,"p256dh"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_subscriptions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"question_answers": {
                  Row: {
                    "answer": string,"created_at": string,"day": string,"id": string,"question_id": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "answer": string,"created_at"?: string,"day"?: string,"id"?: string,"question_id": number,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "answer"?: string,"created_at"?: string,"day"?: string,"id"?: string,"question_id"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "question_answers_question_id_fkey"
      columns: ["question_id"]
isOneToOne: false
      referencedRelation: "daily_questions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "question_answers_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"question_schedule": {
                  Row: {
                    "day": string,"question_id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "day": string,"question_id": number
                  }
                  Update: {
                    "day"?: string,"question_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "question_schedule_question_id_fkey"
      columns: ["question_id"]
isOneToOne: false
      referencedRelation: "daily_questions"
      referencedColumns: ["id"]
    }
                  ]
                },"songs": {
                  Row: {
                    "added_by": string,"artist": string,"created_at": string,"dedication": string | null,"id": string,"title": string,"url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "added_by"?: string,"artist": string,"created_at"?: string,"dedication"?: string | null,"id"?: string,"title": string,"url"?: string | null
                  }
                  Update: {
                    "added_by"?: string,"artist"?: string,"created_at"?: string,"dedication"?: string | null,"id"?: string,"title"?: string,"url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "songs_added_by_fkey"
      columns: ["added_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"surprises": {
                  Row: {
                    "author_id": string,"body": string,"created_at": string,"id": string,"image_path": string | null,"kind": string,"opened_at": string | null,"recipient_id": string,"reveal_at": string,"title": string,"wrap": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string,"body": string,"created_at"?: string,"id"?: string,"image_path"?: string | null,"kind"?: string,"opened_at"?: string | null,"recipient_id": string,"reveal_at"?: string,"title": string,"wrap"?: string
                  }
                  Update: {
                    "author_id"?: string,"body"?: string,"created_at"?: string,"id"?: string,"image_path"?: string | null,"kind"?: string,"opened_at"?: string | null,"recipient_id"?: string,"reveal_at"?: string,"title"?: string,"wrap"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "surprises_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "surprises_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"uploads": {
                  Row: {
                    "area": string,"bucket": string,"created_at": string,"id": string,"mime_type": string,"owner_id": string,"path": string,"size_bytes": number
                  }
                  ComputedFields: never
                  Insert: {
                    "area": string,"bucket"?: string,"created_at"?: string,"id"?: string,"mime_type": string,"owner_id"?: string,"path": string,"size_bytes": number
                  }
                  Update: {
                    "area"?: string,"bucket"?: string,"created_at"?: string,"id"?: string,"mime_type"?: string,"owner_id"?: string,"path"?: string,"size_bytes"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "uploads_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "berlin_today":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"call_set_status":
{ Args: { "call_id": string,"next_status": string,"reason"?: string }; Returns: string
                           },
"device_end":
{ Args: { "device_id": string }; Returns: undefined
                           },
"device_heartbeat":
{ Args: { "info": Json }; Returns: Json
                           },
"devices_overview":
{ Args: Record<PropertyKey, never>; Returns: {
              "app_version": string,"battery_charging": boolean,"battery_level": number,"browser": string,"browser_version": string,"connection": string,"created_at": string,"device_type": string,"id": string,"last_heartbeat_at": string,"mine": boolean,"name": string,"online": boolean,"os": string,"os_version": string,"pwa": boolean,"screen": string,"server_time": string,"share": Json,"user_id": string,"viewport": string
            }[]
                           },
"game_counterpart":
{ Args: { "g": string }; Returns: string
                           },
"game_progress":
{ Args: Record<PropertyKey, never>; Returns: {
              "game": string,"prompt_key": string,"user_id": string
            }[]
                           },
"has_answered":
{ Args: { "q_day": string,"q_id": number }; Returns: boolean
                           },
"has_game_response":
{ Args: { "g": string,"k": string }; Returns: boolean
                           },
"integration_mark":
{ Args: { "p_error": string,"p_provider": string,"p_status": string }; Returns: undefined
                           },
"integration_save":
{ Args: { "p_ciphertext": string,"p_expires_at": string,"p_label": string,"p_provider": string,"p_scopes": (string)[] }; Returns: undefined
                           },
"integration_token":
{ Args: { "p_provider": string }; Returns: {
              "ciphertext": string,"expires_at": string
            }[]
                           },
"is_member":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"log_activity":
{ Args: { "actor": string,"event_kind": string,"ref": string,"text_summary": string }; Returns: undefined
                           },
"mark_letter_opened":
{ Args: { "letter_id": string }; Returns: undefined
                           },
"mark_pop_shown":
{ Args: { "pop_id": string }; Returns: undefined
                           },
"mark_surprise_opened":
{ Args: { "surprise_id": string }; Returns: undefined
                           },
"partner_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"push_dispatch":
{ Args: { "actor": string,"event_type": string,"record_id": string }; Returns: undefined
                           },
"push_public_key":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"push_register":
{ Args: { "sub_auth": string,"sub_device": string,"sub_endpoint": string,"sub_label": string,"sub_p256dh": string }; Returns: string
                           },
"question_for_day":
{ Args: { "q_day"?: string }; Returns: {
              "day": string,"question": string,"question_id": number
            }[]
                           },
"question_progress":
{ Args: { "q_day"?: string }; Returns: {
              "answered_at": string,"user_id": string
            }[]
                           },
"sealed_letters":
{ Args: Record<PropertyKey, never>; Returns: {
              "author_id": string,"category": string,"created_at": string,"id": string,"open_at": string,"recipient_id": string
            }[]
                           },
"sealed_surprises":
{ Args: Record<PropertyKey, never>; Returns: {
              "author_id": string,"created_at": string,"id": string,"kind": string,"reveal_at": string,"wrap": string
            }[]
                           },
"unread_counts":
{ Args: Record<PropertyKey, never>; Returns: {
              "conversation_id": string,"unread": number
            }[]
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
