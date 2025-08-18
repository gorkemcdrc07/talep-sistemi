import { createClient } from "@supabase/supabase-js";

// URL: https://<ref>.supabase.co  (token içindeki "ref" = sizin proje ref'iniz)
const SUPABASE_URL = "https://sqdkpockkfpedygzvwlp.supabase.co".replace(" ", "");
// Sadece ANON key'i burada kullanýn (service_role ASLA!)
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxZGtwb2Nra2ZwZWR5Z3p2d2xwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTI2NzQ1NCwiZXhwIjoyMDcwODQzNDU0fQ.VoK_XNE9k-lsOTfDguwF2pZBAX2hAGvFWh0xvgSUjQg";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export default supabase;
