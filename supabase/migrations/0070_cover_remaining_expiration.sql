-- Completa la cobertura de caducidad del catálogo. El dataset de perfiles
-- (packages/shared/src/data/ingredient-expiration-profiles.json) solo cubre los 331 ingredientes
-- del seed 0007; el resolver de recetas ha ido creando el resto y ninguno tenía perfil, así que
-- `household_expiration_snapshot` los descartaba: su join contra expiration_profiles es interno,
-- de modo que un lote sin perfil no aparece como "sin datos", desaparece del todo.
--
-- 0055 y 0061 intentaron tapar esto con una lista curada de 16 proteínas, pero 15 de esos nombres
-- no existían todavía en el catálogo cuando corrieron (el resolver los crea al sembrar recetas,
-- después de migrar), así que el join no mapeó nada. Aquí se listan los 134 nombres que hoy están
-- realmente en la tabla.
--
-- Se mapea contra perfiles ya existentes en 0049, sin ampliar ningún límite de seguridad. Los
-- productos sin caducidad práctica (agua, bicarbonato, alcoholes, azúcares) van a perfiles con
-- priority_eligible = false para que nunca avisen como críticos.

insert into public.ingredient_expiration_profiles (ingredient_id, profile_id, match_type)
select i.id, m.profile_id, m.match_type
from (
  values
    -- Carnes
    ('butifarra', 'meat-sausage-fresh', 'family'),
    ('carne de cerdo', 'meat-red-fresh', 'family'),
    ('carne de pato', 'meat-poultry-fresh', 'family'),
    ('carne picada de cerdo', 'meat-sausage-fresh', 'family'),
    ('carne picada de cordero', 'meat-sausage-fresh', 'family'),
    ('cecina', 'meat-cured-ham', 'family'),
    ('chicharron de cerdo', 'meat-cured-short', 'fallback'),
    ('cochinillo', 'meat-red-fresh', 'family'),
    ('corazon de res', 'meat-offal', 'family'),
    ('hueso para caldo', 'meat-red-fresh', 'fallback'),
    ('manteca de cerdo', 'dairy-butter', 'fallback'),
    ('pate de cerdo', 'meat-cured-short', 'family'),
    ('ternera', 'meat-red-fresh', 'family'),
    ('tripas de cordero', 'meat-offal', 'fallback'),

    -- Pescados y mariscos
    ('anguila', 'fish-fatty', 'family'),
    ('congrio', 'fish-lean', 'family'),
    ('palito de cangrejo', 'meat-cured-short', 'fallback'),
    ('pescado para caldo', 'fish-lean', 'fallback'),

    -- Verduras y hortalizas
    ('alga nori', 'grain-dry', 'fallback'),
    ('alga wakame', 'grain-dry', 'fallback'),
    ('berro', 'vegetable-leafy', 'family'),
    ('brote de bambu', 'canned-low-acid', 'fallback'),
    ('brote de soja', 'vegetable-leafy', 'family'),
    ('calcot', 'vegetable-allium-green', 'family'),
    ('cebolla', 'vegetable-onion', 'direct'),
    ('cebolleta', 'vegetable-allium-green', 'direct'),
    ('cebollita', 'vegetable-onion', 'family'),
    ('chalota', 'vegetable-onion', 'family'),
    ('chayote', 'vegetable-summer-squash', 'family'),
    ('chucrut', 'canned-high-acid', 'family'),
    ('col', 'vegetable-crucifer', 'family'),
    ('ensalada mixta', 'vegetable-leafy', 'family'),
    ('espinaca de agua', 'vegetable-leafy', 'family'),
    ('grelos', 'vegetable-leafy', 'family'),
    ('hoja de platano', 'vegetable-leafy', 'fallback'),
    ('jengibre', 'vegetable-root', 'family'),
    ('loroco', 'vegetable-leafy', 'fallback'),
    ('nabo', 'vegetable-root', 'family'),
    ('name', 'vegetable-potato', 'family'),
    ('remolacha', 'vegetable-root', 'family'),
    ('reollo', 'vegetable-leafy', 'fallback'),
    ('tomatillo verde', 'vegetable-tomato', 'family'),
    ('yuca', 'vegetable-potato', 'family'),

    -- Frutas
    ('pasa sultana', 'grain-dry', 'fallback'),
    ('platano maduro', 'fruit-banana', 'direct'),

    -- Lácteos y huevos
    ('nata agria', 'dairy-cream', 'family'),
    ('queso cheddar', 'cheese-semi-hard', 'family'),
    ('queso gorgonzola', 'cheese-soft', 'family'),
    ('queso paneer', 'cheese-fresh', 'family'),
    ('queso pecorino', 'cheese-hard', 'family'),
    ('suero de leche', 'dairy-milk', 'family'),

    -- Legumbres
    ('alubia roja', 'legume-dry', 'family'),
    ('garrofon', 'legume-dry', 'family'),
    ('lenteja roja', 'legume-dry', 'family'),
    ('poroto pallar', 'legume-dry', 'family'),

    -- Frutos secos y semillas
    ('crema de cacahuete', 'oil-nut-seed', 'fallback'),
    ('tahini', 'oil-nut-seed', 'family'),

    -- Cereales, pan y pasta
    ('arepa', 'bread-fresh', 'family'),
    ('chocolate negro', 'sugar-long', 'fallback'),
    ('fecula de patata', 'flour-white', 'family'),
    ('fideo', 'pasta-dry', 'family'),
    ('fideo de arroz', 'pasta-dry', 'family'),
    ('fideo ramen', 'pasta-dry', 'family'),
    ('harina de almortas', 'flour-white', 'family'),
    ('harina de arroz', 'flour-white', 'family'),
    ('harina de garbanzo', 'flour-white', 'family'),
    ('masa de hojaldre', 'bread-packaged', 'fallback'),
    ('masa de pizza', 'bread-packaged', 'fallback'),
    ('mote cocido', 'canned-low-acid', 'family'),
    ('oblea para gyoza', 'bread-packaged', 'fallback'),
    ('pastel de arroz', 'grain-dry', 'fallback'),
    ('semola de trigo', 'flour-white', 'family'),
    ('tortilla de maiz', 'bread-packaged', 'family'),

    -- Especias y hierbas
    ('achiote', 'spice-ground', 'family'),
    ('cardamomo molido', 'spice-ground', 'direct'),
    ('cascara de naranja y canela', 'spice-whole', 'fallback'),
    ('chile pasilla seco', 'spice-whole', 'family'),
    ('chile poblano', 'vegetable-pepper', 'family'),
    ('chile rojo', 'vegetable-pepper', 'family'),
    ('chile serrano', 'vegetable-pepper', 'family'),
    ('chili en polvo', 'spice-ground', 'direct'),
    ('coriandro en polvo', 'spice-ground', 'direct'),
    ('culantro panameno', 'herb-fresh', 'family'),
    ('curcuma', 'spice-ground', 'family'),
    ('curry en polvo', 'spice-ground', 'direct'),
    ('garam masala', 'spice-ground', 'direct'),
    ('guindilla', 'spice-whole', 'family'),
    ('hierba fresca', 'herb-fresh', 'direct'),
    ('hierbas provenzales', 'herb-dry', 'direct'),
    ('hoja de fenogreco', 'herb-dry', 'family'),
    ('hoja de kaffir', 'herb-fresh', 'family'),
    ('jmeli suneli', 'spice-ground', 'family'),
    ('limoncillo', 'herb-fresh', 'family'),
    ('mejorana', 'herb-dry', 'family'),
    ('ras el hanout', 'spice-ground', 'direct'),
    ('sal y pimienta con comino', 'salt-indefinite', 'fallback'),

    -- Condimentos y edulcorantes
    ('esencia de vainilla', 'vinegar-long', 'fallback'),
    ('panela', 'sugar-long', 'family'),

    -- Aceites, vinagres y salsas
    ('aceite de dende', 'oil-general', 'family'),
    ('ghee', 'oil-general', 'family'),
    ('mirin', 'sauce-shelf', 'family'),
    ('pasta de aji amarillo', 'sauce-shelf', 'family'),
    ('pasta de aji panca', 'sauce-shelf', 'family'),
    ('pasta de chile', 'sauce-shelf', 'family'),
    ('pasta de gambas malaya belacan', 'sauce-shelf', 'family'),
    ('pasta de judias picante doubanjiang', 'sauce-shelf', 'family'),
    ('salsa de arandanos', 'sauce-shelf', 'family'),
    ('salsa de ostra', 'sauce-shelf', 'family'),
    ('salsa de pescado', 'sauce-shelf', 'family'),
    ('salsa ketchup', 'sauce-tomato-shelf', 'family'),

    -- Conservas y otros
    ('agua', 'salt-indefinite', 'fallback'),
    ('agua de coco', 'canned-low-acid', 'fallback'),
    ('bicarbonato sodico', 'salt-indefinite', 'fallback'),
    ('caldo dashi', 'broth-shelf', 'family'),
    ('caldo de verduras', 'broth-shelf', 'direct'),
    ('cerveza', 'vinegar-long', 'fallback'),
    ('ensalada rusa', 'sauce-aioli', 'fallback'),
    ('frijol cargamanto cocido', 'canned-low-acid', 'family'),
    ('gelatina', 'sugar-long', 'fallback'),
    ('leche de coco', 'canned-low-acid', 'family'),
    ('levadura fresca', 'dairy-yogurt', 'fallback'),
    ('levadura quimica', 'sugar-long', 'fallback'),
    ('mermelada', 'canned-high-acid', 'family'),
    ('palito de brocheta', 'salt-indefinite', 'fallback'),
    ('pasta de ajo y jengibre', 'sauce-refrigerated', 'family'),
    ('pasta de miso', 'sauce-shelf', 'family'),
    ('pasta de soja fermentada', 'sauce-shelf', 'family'),
    ('sake', 'vinegar-long', 'fallback'),
    ('sopa de crema de champinones en lata', 'canned-low-acid', 'family'),
    ('tamarindo en pasta', 'sauce-shelf', 'family'),
    ('tofu', 'cheese-fresh', 'family'),
    ('vino blanco', 'vinegar-long', 'fallback'),
    ('vino de arroz shaoxing', 'vinegar-long', 'fallback'),
    ('vino tinto', 'vinegar-long', 'fallback')
) as m(normalized_name, profile_id, match_type)
join public.ingredients i on i.normalized_name = m.normalized_name
on conflict (ingredient_id) do nothing;
