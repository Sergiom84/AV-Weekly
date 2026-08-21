/**
 * Location groups confirmed by the AGA building master for the buildings that
 * appear in the first flat ZPT025 export.
 *
 * The managed parser normalises these keys before matching. An unknown
 * building is never guessed or dropped: it is reported and counted under
 * `Sin clasificar`, so adding a new building cannot alter the weekly total.
 */
export const AGA_BUILDING_LOCATIONS: Record<string, string> = {
  "MADRID-AZUL, 4,": "Sede",
  "MADRID-C/ FEDERICO MOMPOU, 5,": "Tablas I",
  "MADRID-FEDERICO MOMPOU,5": "Tablas I",
  "MALAGA-AVDA. SEVERO OCHOA,51": "Malaga",
  "ALMERIA-CARRETERA DE NIJAR, 55,": "Malaga",
  "SEVILLA-AVENIDA DE LA PALMERA, 61-63,": "Sevilla",
  "TRES CANTOS-BATANES, 3/RONDA VALDECARRIZO, 21,": "Tres Cantos",
  "EL PRAT DE LLOBREGAT-C. DEL PI, 2 - POLÍGON MAS MATEU,": "Barcelona",
  "-PL ANTONIO MAURA, 6,": "Barcelona",
  "BARCELONA-PL ANTONIO MAURA, 6,": "Barcelona",
  "VIELHA-LLIBERTAT, 7,": "Barcelona",
  "BARCELONA-PASSEIG DE LA BONANOVA, 47 - PL.3ª,": "Barcelona",
  "BILBAO-GRAN VIA, 12,": "Bilbao",
  "BILBAO-GRAN VIA, 1-3-5,": "Bilbao",
  "LA CORUÑA-CANTON PEQUEÑO, 18-21 /D.LORIGA, 9,": "Coruña",
  "VILAGARCIA DE AROUSA-PLAZA DE GALICIA, 7,": "Coruña",
  "DENIA-AVENIDA MARQUES DEL CAMPO, 29,": "Alicante",
  "MADRID-PASEO DE RECOLETOS, 10,": "Recoletos",
  "-PASEO DE RECOLETOS, 10,": "Madrid",
  "VALLADOLID-DUQUE DE LA VICTORIA, 12,": "Valladolid",
  "TOLEDO-COMERCIO, 43 / NUEVA, 4-6,": "Madrid",
  "-LARGA, 57,": "Madrid",
  "MADRID-CR VILLAVERDE A VALLECAS, 24 DIAMAN,": "Madrid",
  "VALENCIA-PINTOR SOROLLA, 1-3/POETA QUEROL,17,": "Valencia",
  "PIEDRAS BLANCAS-PABLO IGLESIAS, 4-6,": "Asturias",
  "LEON-PLAZA DE SANTO DOMINGO, 9,": "Oviedo",
  "LAS PALMAS-ALBAREDA, 6,": "Canarias",
};
