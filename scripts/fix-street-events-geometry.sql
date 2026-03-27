-- ══════════════════════════════════════════════════════════════════════════════
-- Fix street_events geometries using actual Street_Centerline.geojson coordinates
-- Run this in Supabase SQL Editor to overwrite the manually-estimated geometries
-- ══════════════════════════════════════════════════════════════════════════════

-- Walnut St: Broad St → 19th St
UPDATE street_events
SET geometry = ST_GeomFromText(
  'LINESTRING(-75.1637072 39.9492817, -75.1641954 39.9493440, -75.1643405 39.9493551, -75.1659427 39.9495628, -75.1667338 39.9496648, -75.1675195 39.9497537, -75.1691043 39.9499523, -75.1706703 39.9501409, -75.1722462 39.9503471, -75.1727543 39.9504075)',
  4326)
WHERE street_name = 'Walnut St';

-- 18th St: Chestnut St → Locust St
UPDATE street_events
SET geometry = ST_GeomFromText(
  'LINESTRING(-75.1703371 39.9516687, -75.1704521 39.9511559, -75.1705016 39.9509109, -75.1705726 39.9505893, -75.1706703 39.9501409, -75.1707885 39.9495693, -75.1709140 39.9490027)',
  4326)
WHERE street_name = '18th St';

-- 13th St: Chestnut St → Walnut St
UPDATE street_events
SET geometry = ST_GeomFromText(
  'LINESTRING(-75.1614415 39.9521100, -75.1614544 39.9520343, -75.1615963 39.9514428, -75.1616702 39.9511158, -75.1617852 39.9506027, -75.1618703 39.9502069, -75.1619528 39.9498451, -75.1621171 39.9490896)',
  4326)
WHERE street_name = '13th St';

-- Sansom St: Juniper St → 12th St
UPDATE street_events
SET geometry = ST_GeomFromText(
  'LINESTRING(-75.1634294 39.9500109, -75.1632980 39.9500112, -75.1630075 39.9499745, -75.1629668 39.9499718, -75.1629176 39.9499698, -75.1619528 39.9498451, -75.1603748 39.9496483)',
  4326)
WHERE street_name = 'Sansom St';

-- Drury St (alley between 13th & Sansom)
UPDATE street_events
SET geometry = ST_GeomFromText(
  'LINESTRING(-75.1618703 39.9502069, -75.1628899 39.9503312)',
  4326)
WHERE street_name = 'Drury St';

-- Verify
SELECT street_name, COUNT(*) as event_count,
       ST_AsText(ST_Envelope(geometry)) as bbox
FROM street_events
GROUP BY street_name, geometry
ORDER BY street_name;
