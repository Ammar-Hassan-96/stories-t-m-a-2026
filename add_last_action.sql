-- إضافة عمود last_action — بيحفظ آخر تعديل AI على القصة
ALTER TABLE stories
ADD COLUMN IF NOT EXISTS last_action TEXT DEFAULT NULL;

-- إضافة عمود last_action_at — وقت آخر تعديل AI
ALTER TABLE stories
ADD COLUMN IF NOT EXISTS last_action_at TIMESTAMPTZ DEFAULT NULL;

-- index للبحث السريع بالوقت
CREATE INDEX IF NOT EXISTS idx_stories_last_action_at
ON stories(last_action_at);
