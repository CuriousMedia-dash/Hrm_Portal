-- =====================================================================
-- Curious Media — employee directory (27 people)
--
-- Columns: full name, department, designation, employment type,
-- date of birth, status. Nothing else, as requested.
--
-- REQUIREMENT: run supabase/allow_null_email.sql first (once). These
-- records carry no email, and the column is NOT NULL until you do.
--
-- BIRTH YEARS ARE PLACEHOLDERS — your sheet had day and month only, so
-- every year is 1900. The birthday alerts read only day and month, so
-- they are correct as they stand. Replace the years when you have them.
--
-- EMAILS COME LATER. A record with no email cannot be matched to a
-- signup, so before someone gets portal access, open Employees, edit
-- them, and add their work email. Until then they are directory-only.
--
-- Re-running this file adds the same people again — there is no email to
-- match on. Run it once. To start over:
--   delete from public.employees where email is null;
-- =====================================================================

insert into public.employees
  (full_name, department, designation, employment_type, date_of_birth, status)
values
  ('Aanchal Sharma', 'Leadership', 'Founder & CEO', 'full_time', '1900-06-20', 'active'),   -- 20 June
  ('Pushpraj Singh', 'Leadership', 'COO & CRO', 'full_time', '1900-02-23', 'active'),   -- 23 February
  ('Aayush Chhabra', 'Post Production', 'Post Production Head', 'full_time', '1900-05-13', 'active'),   -- 13 May
  ('Rahul Gupta', 'Distribution', 'Distribution Head', 'full_time', '1900-01-28', 'active'),   -- 28 January
  ('Yash Aggarwal', 'Social Media', 'Senior Associate', 'full_time', '1900-06-21', 'active'),   -- 21 June
  ('Hema Syalkoti', 'Social Media', 'Associate', 'full_time', '1900-01-21', 'active'),   -- 21 January
  ('Snehagni', 'Social Media', 'Social Media', 'full_time', '1900-02-10', 'active'),   -- 10 February
  ('Siddhi Niranjan', 'Social Media', 'Associate', 'full_time', '1900-04-27', 'active'),   -- 27 April
  ('Manisha', 'Social Media', 'Associate', 'full_time', '1900-05-16', 'active'),   -- 16 May
  ('Anushka Butola', 'Social Media', 'Associate', 'full_time', '1900-07-24', 'active'),   -- 24 July
  ('Vibhuti Makhija', 'Social Media', 'Social Media', 'full_time', '1900-09-10', 'active'),   -- 10 September
  ('Swapnil Arde', 'Social Media', 'Management Trainee', 'full_time', '1900-12-17', 'active'),   -- 17 December
  ('Ayush Negi', 'Social Media', 'Social Media', 'full_time', '1900-08-01', 'active'),   -- 1 August
  ('Krishna Rawat', 'Social Media', 'Social Media', 'full_time', '1900-02-15', 'active'),   -- 15 February
  ('Ritik Chauhan', 'Social Media', 'Social Media', 'full_time', '1900-05-13', 'active'),   -- 13 May
  ('Pooja Lodhi', 'Editorial', 'Sr. Editor', 'full_time', '1900-11-10', 'active'),   -- 10 November
  ('Keerti Singh', 'Editorial', 'Editor', 'full_time', '1900-03-09', 'active'),   -- 9 March
  ('Mubassara Saifi', 'Editorial', 'Editor', 'full_time', '1900-02-07', 'active'),   -- 7 February
  ('Shruti Jain', 'Editorial', 'Editor', 'full_time', '1900-11-18', 'active'),   -- 18 November
  ('Tushar Chhabra', 'Editorial', 'Jr. Editor', 'full_time', '1900-04-16', 'active'),   -- 16 April
  ('Manish Singh', 'Editorial', 'Intern', 'intern', '1900-01-27', 'active'),   -- 27 January
  ('Aliza Rizvi', 'Editorial', 'Jr. Editor', 'full_time', '1900-09-20', 'active'),   -- 20 September
  ('Isha Kumari', 'Influencer Marketing', 'Influencer Marketing Executive', 'full_time', '1900-09-05', 'active'),   -- 5 September
  ('Ritik', 'Influencer Marketing', 'Executive', 'full_time', '1900-05-24', 'active'),   -- 24 May
  ('Nishta Gupta', 'Influencer Marketing', 'Associate', 'full_time', '1900-08-29', 'active'),   -- 29 August
  ('Rishita Chandola', 'Growth & Strategy', 'Growth and Strategy Associate', 'full_time', '1900-11-17', 'active'),   -- 17 November
  ('Advyith Vihit Reddy', 'Growth & Strategy', 'Product Management', 'full_time', '1900-07-30', 'active')   -- 30 July
;

-- What landed, in birthday order through the year:
select full_name, department, designation, employment_type,
       to_char(date_of_birth, 'DD Mon') as birthday, status
  from public.employees
 order by extract(month from date_of_birth), extract(day from date_of_birth);
