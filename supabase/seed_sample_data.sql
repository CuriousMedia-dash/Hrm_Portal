-- =====================================================================
-- OPTIONAL: a few sample employees so the directory is not empty while
-- you are building. These have no login accounts (user_id is null);
-- when a person signs up with the same email they get linked automatically.
-- Delete this data any time:  delete from public.employees where employee_code like 'CM-%';
-- =====================================================================

insert into public.employees
  (employee_code, full_name, email, phone, department, designation, employment_type, date_of_joining, location, status)
values
  ('CM-001', 'Ananya Rao',    'ananya@curiousmedia.in',  '+91 98860 11223', 'Content',    'Content Lead',        'full_time', '2023-04-10', 'Bengaluru', 'active'),
  ('CM-002', 'Rohit Sharma',  'rohit@curiousmedia.in',   '+91 98450 44556', 'Growth',     'Growth Manager',      'full_time', '2024-01-15', 'Bengaluru', 'active'),
  ('CM-003', 'Meera Nair',    'meera@curiousmedia.in',   '+91 99001 77889', 'Design',     'Senior Designer',     'full_time', '2022-11-02', 'Kochi',     'active'),
  ('CM-004', 'Arjun Verma',   'arjun@curiousmedia.in',   '+91 90080 33445', 'Technology', 'Full Stack Engineer', 'full_time', '2024-07-01', 'Bengaluru', 'active'),
  ('CM-005', 'Sneha Kulkarni','sneha@curiousmedia.in',   '+91 97400 66778', 'Operations', 'Ops Executive',       'intern',    '2025-06-16', 'Remote',    'active')
on conflict (email) do nothing;
