/* =====================================================================
   SUPABASE CONFIGURATION (multi-device / server-enforced mode)
   ---------------------------------------------------------------------
   • Leave BOTH values EMPTY  -> the app runs in LOCAL mode
     (all data stored in this browser via IndexedDB — single terminal).
   • Fill them with your project -> CLOUD mode: shared multi-device,
     real accounts, and a DATABASE-LEVEL unique constraint that blocks
     duplicate meals across devices in real time.

   Where to find these values:
     Supabase -> your project -> Project Settings -> API
       - "Project URL"        -> SUPABASE_URL
       - "anon public" / Publishable key -> SUPABASE_ANON_KEY  (safe to ship)

   Run supabase-schema.sql in the Supabase SQL editor first (creates the
   tables, the unique meal constraint, RLS policies, and roles).
   ===================================================================== */
window.SUPABASE_URL      = "https://ooekcxbxxgbllcnzggod.supabase.co";
window.SUPABASE_ANON_KEY = "sb_publishable_e4vGqESZy6df3UZVm9ZiZw_0K4OqJ-K";
