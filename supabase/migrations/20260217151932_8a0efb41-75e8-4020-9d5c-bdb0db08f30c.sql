
-- Many-to-many table linking subscribers to specific channels
CREATE TABLE public.subscriber_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id uuid NOT NULL REFERENCES public.telegram_subscribers(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.telegram_channels(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(subscriber_id, channel_id)
);

-- Enable RLS
ALTER TABLE public.subscriber_channels ENABLE ROW LEVEL SECURITY;

-- RLS: owners can manage their subscriber-channel links
CREATE POLICY "Owners can view subscriber channels"
ON public.subscriber_channels FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.telegram_subscribers s
    WHERE s.id = subscriber_id AND s.owner_id = auth.uid()
  )
);

CREATE POLICY "Owners can insert subscriber channels"
ON public.subscriber_channels FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.telegram_subscribers s
    WHERE s.id = subscriber_id AND s.owner_id = auth.uid()
  )
);

CREATE POLICY "Owners can delete subscriber channels"
ON public.subscriber_channels FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.telegram_subscribers s
    WHERE s.id = subscriber_id AND s.owner_id = auth.uid()
  )
);
