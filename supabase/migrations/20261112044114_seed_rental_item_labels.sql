-- Reference categories, not training data. Verified against yolov8n-oiv7.pt.
-- Five shared items plus one computer mouse: six categories in total.
-- Do not replace existing IDs, display names or active flags on a repeated run.
insert into public.item_labels (name, model_label)
values
  ('계산기', 'Calculator'),
  ('가위', 'Scissors'),
  ('스테이플러', 'Stapler'),
  ('자', 'Ruler'),
  ('우산', 'Umbrella'),
  ('마우스', 'Computer mouse')
on conflict (model_label) do nothing;
