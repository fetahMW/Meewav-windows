// Original architectural interpretations. Dimensions are modelling envelopes
// in metres; coordinates are monument anchors, not city centroids.
export const cityLandmarks = [
  ['13055','Marseille','garde','Notre-Dame de la Garde',5.371,43.2841,65,65,0,'Basilique_Notre-Dame-de-la-Garde'],
  ['69123','Lyon','fourviere','Basilique de Fourvière',4.8225,45.7625,48,90,90,'Basilique_Notre-Dame_de_Fourvière'],
  ['31555','Toulouse','capitole','Le Capitole',1.444,43.6045,27,128,90,'Capitole_de_Toulouse'],
  ['44109','Nantes','nantes','Château des ducs de Bretagne',-1.55,47.215833,32,125,15,'Château_des_ducs_de_Bretagne'],
  ['34172','Montpellier','peyrou','Arc de triomphe du Peyrou',3.872361,43.611111,15,19,90,'Arc_de_triomphe_(Montpellier)'],
  ['67482','Strasbourg','strasbourg','Cathédrale de Strasbourg',7.750833,48.581667,142,112,80,'Cathédrale_Notre-Dame_de_Strasbourg'],
  ['33063','Bordeaux','cloche','Grosse Cloche',-.571389,44.8353,40,28,0,'Grosse_cloche_de_Bordeaux'],
  ['59350','Lille','lille','Beffroi de Lille',3.069819,50.630494,104,22,0,'Beffroi_de_Lille'],
  ['35238','Rennes','parlement','Parlement de Bretagne',-1.6778,48.1128,32,57,0,'Palais_du_Parlement_de_Bretagne'],
  ['83137','Toulon','opera','Opéra de Toulon',5.9328,43.1254,32,68,0,'Opéra_de_Toulon'],
  ['51454','Reims','reims','Cathédrale de Reims',4.034167,49.253889,81,149,65,'Cathédrale_Notre-Dame_de_Reims'],
  ['42218','Saint-Étienne','couriot','Chevalement du puits Couriot',4.3767,45.4397,35,32,0,'Puits_Couriot'],
  ['76351','Le Havre','joseph','Église Saint-Joseph',.1007,49.49,107,44,0,'Église_Saint-Joseph_du_Havre'],
  ['69266','Villeurbanne','villeurbanne','Hôtel de ville de Villeurbanne',4.8795,45.766,65,76,0,'Hôtel_de_ville_de_Villeurbanne'],
  ['21231','Dijon','philippe','Tour Philippe le Bon',5.0416,47.3225,46,14,0,'Tour_Philippe_le_Bon'],
  ['49007','Angers','angers',"Château d’Angers",-.5604,47.4691,30,165,20,"Château_d'Angers"],
  ['38185','Grenoble','perret','Tour Perret',5.73528,45.18472,86,14,0,'Tour_Perret_(Grenoble)'],
  ['97411','Saint-Denis · La Réunion','saintdenis','Ancien hôtel de ville de Saint-Denis',55.4504,-20.8789,18,48,0,'Hôtel_de_ville_de_Saint-Denis_(La_Réunion)'],
].map(([cityCode,city,id,name,lon,lat,heightMetres,footprintMetres,bearing,wikipedia]) => ({
  cityCode, city, id, name, lon, lat, heightMetres, footprintMetres, bearing,
  clearanceRadiusMetres: Math.ceil(footprintMetres * .65 + 15),
  asset: `${id}_violet_light.glb`, preserveMaterials: true,
  source: `https://fr.wikipedia.org/wiki/${encodeURIComponent(wikipedia)}`,
}));
