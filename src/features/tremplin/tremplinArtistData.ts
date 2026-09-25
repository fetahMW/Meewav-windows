import { getDesktopApplicationMode } from "../../runtime/applicationMode";
/**
 * Canonical, non-financial artist profiles for the Tremplin experience.
 * Token economics and transaction mocks live in tremplinTokenData.ts.
 */
import { danceRoster } from "./generatedRoster/danceRoster.ts";
import { pianoRoster } from "./generatedRoster/pianoRoster.ts";
import { soundImageRoster } from "./generatedRoster/soundImageRoster.ts";
import { supportRoster } from "./generatedRoster/supportRoster.ts";

export type TremplinMetricFamily = "parcours" | "audience" | "communaute";

export type TremplinMetric = {
  id: string;
  family: TremplinMetricFamily;
  title: string;
  indicator: string;
  explanation: string;
  values: readonly number[];
};

export type TremplinAudioPreview = {
  title: string;
  subtitle: string;
  durationLabel: string;
  audioSrc: string;
  waveform: readonly number[];
};

export type TremplinArtistUpdate = {
  id: string;
  dateLabel: string;
  title: string;
  summary: string;
};

export type TremplinCommunityMetrics = {
  memberCount: number;
  newMembers30Days: number;
};

export type TremplinProjectSnapshot = {
  headline: string;
  progressPercent: number;
  nextMilestone: string;
  supportNeed: string;
  proofPoints: readonly string[];
};

export type TremplinArtist = {
  id: string;
  /** Identifiant canonique du profil public lorsque l’artiste vient du backend. */
  profileId?: string;
  name: string;
  gradeLevel: 1 | 2 | 3 | 4 | 5 | 6;
  portrait: string;
  disciplines: readonly string[];
  exactProfession?: string;
  styles: readonly string[];
  city: string;
  region: string;
  stageLabel: string;
  biography: string;
  accent: {
    primary: string;
    secondary: string;
  };
  artwork: string;
  community: TremplinCommunityMetrics;
  audio: TremplinAudioPreview;
  updates: readonly TremplinArtistUpdate[];
  metrics: readonly TremplinMetric[];
  editorialSelection: boolean;
  isAiArtist?: boolean;
  roleId?: import("./tremplinRoleData").TremplinRoleId;
  project?: TremplinProjectSnapshot;
};

const coreTremplinArtists: readonly TremplinArtist[] = [
  {
    "id": "lunae",
    "name": "Lunaé",
    "gradeLevel": 3,
    "portrait": "/images/tremplin/artists/lunae-hero-v3.webp",
    "disciplines": ["Chanteuse","Autrice"],
    "styles": ["R&B alternatif","Neo soul"],
    "city": "Paris",
    "region": "Île-de-France",
    "stageLabel": "EP en production",
    "biography": "Lunaé écrit à la frontière de la neo soul et du R&B alternatif. Après trois singles autoproduits, elle rassemble une équipe pour donner une cohérence sonore et visuelle à son premier EP.",
    "accent": {
      "primary": "#9b6cff",
      "secondary": "#526bff"
    },
    "artwork": "/images/tremplin/artists/lunae-hero-v3.webp",
    "community": {
      "memberCount": 286,
      "newMembers30Days": 42
    },
    "audio": {
      "title": "Sans bruit",
      "subtitle": "Extrait exclusif · 1:08",
      "durationLabel": "1:08",
      "audioSrc": "/media/preprofile-demo/hazy-after-hours.mp3",
      "waveform": [0.63,0.44,0.22,0.12,0.12,0.14,0.32,0.5,0.62,0.63,0.55,0.42,0.3,0.24,0.24,0.3,0.39,0.47,0.51,0.52,0.51,0.5,0.48,0.46,0.43,0.4,0.36,0.35,0.39,0.46,0.55,0.63,0.66,0.61,0.48,0.32,0.19,0.15,0.23,0.4,0.59,0.73,0.74,0.62,0.39,0.16,0.12,0.12,0.18,0.42,0.65,0.77,0.72,0.52,0.25,0.12]
    },
    "updates": [
      {
        "id": "lunae-u1",
        "dateLabel": "15 juillet",
        "title": "Les voix de l'EP sont enregistrées",
        "summary": "Les dernières harmonies ont été enregistrées au Studio 44."
      },
      {
        "id": "lunae-u2",
        "dateLabel": "2 juillet",
        "title": "La cover a été choisie",
        "summary": "La communauté a départagé trois pistes visuelles lors d'une écoute privée."
      }
    ],
    "metrics": [
      {
        "id": "audience-engagee",
        "family": "audience",
        "title": "Une audience qui revient",
        "indicator": "+15 % d'auditeurs engagés",
        "explanation": "De plus en plus de personnes reviennent écouter et interagir avec les créations de l'artiste.",
        "values": [4200,4661,4792,5009,5533,5892]
      },
      {
        "id": "regularite-sorties",
        "family": "parcours",
        "title": "Un parcours régulier",
        "indicator": "7 sorties ou étapes publiées",
        "explanation": "Les étapes annoncées sont documentées afin que la communauté puisse suivre le travail accompli.",
        "values": [4,5,5,5,6,7]
      },
      {
        "id": "croissance-communaute",
        "family": "communaute",
        "title": "Une communauté qui se construit",
        "indicator": "286 membres actifs",
        "explanation": "Ce graphique suit le nombre de personnes qui accompagnent le projet, sans présumer d'un résultat financier.",
        "values": [154,176,187,200,224,243]
      }
    ],
    "editorialSelection": true
  },
  {
    "id": "sama-k",
    "name": "Sama K",
    "gradeLevel": 3,
    "portrait": "/images/tremplin/artists/generated/sama-k-editorial-v1.webp",
    "disciplines": ["Rappeur","Auteur"],
    "styles": ["Rap méditerranéen","Boom bap"],
    "city": "Marseille",
    "region": "Provence-Alpes-Côte d'Azur",
    "stageLabel": "Premières scènes",
    "biography": "Sama K raconte Marseille sans carte postale. Son écriture précise et sa présence scénique l'ont conduit de petites scènes ouvertes à la préparation d'une première date en tête d'affiche.",
    "accent": {
      "primary": "#7c5cff",
      "secondary": "#3da8ff"
    },
    "artwork": "/images/tremplin/artists/generated/sama-k-editorial-v1.webp",
    "community": {
      "memberCount": 194,
      "newMembers30Days": 31
    },
    "audio": {
      "title": "Dernier arrêt",
      "subtitle": "Maquette live · 0:54",
      "durationLabel": "0:54",
      "audioSrc": "/media/preprofile-demo/tech-house-vibes.mp3",
      "waveform": [0.12,0.12,0.3,0.56,0.73,0.75,0.61,0.37,0.15,0.12,0.12,0.21,0.43,0.63,0.73,0.69,0.55,0.37,0.23,0.18,0.23,0.36,0.49,0.59,0.63,0.6,0.53,0.46,0.42,0.39,0.39,0.4,0.41,0.43,0.45,0.49,0.53,0.56,0.54,0.48,0.38,0.27,0.2,0.21,0.3,0.45,0.59,0.67,0.63,0.48,0.28,0.12,0.12,0.12,0.25,0.48]
    },
    "updates": [
      {
        "id": "sama-u1",
        "dateLabel": "11 juillet",
        "title": "Le trio live est réuni",
        "summary": "Basse, batterie et claviers ont répété les deux premiers titres."
      },
      {
        "id": "sama-u2",
        "dateLabel": "27 juin",
        "title": "La tracklist est fixée",
        "summary": "Huit titres et deux interludes forment désormais le trajet complet."
      }
    ],
    "metrics": [
      {
        "id": "audience-engagee",
        "family": "audience",
        "title": "Une audience qui revient",
        "indicator": "+14 % d'auditeurs engagés",
        "explanation": "De plus en plus de personnes reviennent écouter et interagir avec les créations de l'artiste.",
        "values": [3100,3440,3537,3697,4084,4349]
      },
      {
        "id": "regularite-sorties",
        "family": "parcours",
        "title": "Un parcours régulier",
        "indicator": "6 sorties ou étapes publiées",
        "explanation": "Les étapes annoncées sont documentées afin que la communauté puisse suivre le travail accompli.",
        "values": [3,3,4,4,4,5]
      },
      {
        "id": "croissance-communaute",
        "family": "communaute",
        "title": "Une communauté qui se construit",
        "indicator": "194 membres actifs",
        "explanation": "Ce graphique suit le nombre de personnes qui accompagnent le projet, sans présumer d'un résultat financier.",
        "values": [105,120,127,136,153,166]
      }
    ],
    "editorialSelection": true
  },
  {
    "id": "neo-sillage",
    "name": "Néo Sillage",
    "gradeLevel": 2,
    "portrait": "/images/tremplin/artists/generated/neo-sillage-editorial-v1.webp",
    "disciplines": ["Producteur","Claviériste"],
    "styles": ["Electronica","Ambient"],
    "city": "Nantes",
    "region": "Pays de la Loire",
    "stageLabel": "Live en construction",
    "biography": "Néo Sillage compose des pièces électroniques lentes qu'il transforme en direct avec des synthétiseurs et des bandes enregistrées sur le terrain.",
    "accent": {
      "primary": "#865dff",
      "secondary": "#19b8d6"
    },
    "artwork": "/images/tremplin/artists/generated/neo-sillage-editorial-v1.webp",
    "community": {
      "memberCount": 221,
      "newMembers30Days": 49
    },
    "audio": {
      "title": "Estuaire",
      "subtitle": "Version résidence · 1:12",
      "durationLabel": "1:12",
      "audioSrc": "/media/preprofile-demo/hazy-after-hours.mp3",
      "waveform": [0.58,0.72,0.7,0.54,0.3,0.12,0.12,0.12,0.23,0.49,0.71,0.8,0.72,0.51,0.26,0.12,0.12,0.15,0.37,0.6,0.75,0.77,0.66,0.47,0.3,0.2,0.21,0.32,0.48,0.6,0.66,0.64,0.56,0.46,0.38,0.33,0.33,0.36,0.39,0.42,0.44,0.46,0.48,0.5,0.49,0.45,0.38,0.29,0.22,0.19,0.24,0.36,0.49,0.59,0.6,0.51]
    },
    "updates": [
      {
        "id": "neo-u1",
        "dateLabel": "17 juillet",
        "title": "Le troisième tableau est terminé",
        "summary": "Les projections réagissent maintenant aux fréquences basses du live."
      },
      {
        "id": "neo-u2",
        "dateLabel": "6 juillet",
        "title": "Trois jours de résidence confirmés",
        "summary": "Le lieu mettra à disposition la scène et la régie au début du mois d'août."
      }
    ],
    "metrics": [
      {
        "id": "audience-engagee",
        "family": "audience",
        "title": "Une audience qui revient",
        "indicator": "+15 % d'auditeurs engagés",
        "explanation": "De plus en plus de personnes reviennent écouter et interagir avec les créations de l'artiste.",
        "values": [2800,3107,3195,3339,3688,3928]
      },
      {
        "id": "regularite-sorties",
        "family": "parcours",
        "title": "Un parcours régulier",
        "indicator": "8 sorties ou étapes publiées",
        "explanation": "Les étapes annoncées sont documentées afin que la communauté puisse suivre le travail accompli.",
        "values": [5,6,6,7,7,8]
      },
      {
        "id": "croissance-communaute",
        "family": "communaute",
        "title": "Une communauté qui se construit",
        "indicator": "221 membres actifs",
        "explanation": "Ce graphique suit le nombre de personnes qui accompagnent le projet, sans présumer d'un résultat financier.",
        "values": [119,136,144,154,173,188]
      }
    ],
    "editorialSelection": false
  },
  {
    "id": "mina-roze",
    "name": "Mina Roze",
    "gradeLevel": 4,
    "portrait": "/images/tremplin/artists/generated/mina-roze-pop-soul-lyon-v1.webp",
    "disciplines": ["Chanteuse","Compositrice"],
    "styles": ["Pop soul","French pop"],
    "city": "Lyon",
    "region": "Auvergne-Rhône-Alpes",
    "stageLabel": "Public en développement",
    "biography": "Mina Roze compose au piano et construit ses chansons avec une équipe réduite. Son prochain clip doit ouvrir un nouveau chapitre visuel après une année de concerts en petites salles.",
    "accent": {
      "primary": "#a563ff",
      "secondary": "#ff6ca8"
    },
    "artwork": "/images/tremplin/artists/generated/mina-roze-pop-soul-lyon-v1.webp",
    "community": {
      "memberCount": 238,
      "newMembers30Days": 28
    },
    "audio": {
      "title": "Les heures bleues",
      "subtitle": "Version piano-voix · 1:05",
      "durationLabel": "1:05",
      "audioSrc": "/media/preprofile-demo/hazy-after-hours.mp3",
      "waveform": [0.28,0.13,0.12,0.12,0.26,0.47,0.65,0.72,0.65,0.47,0.24,0.12,0.12,0.13,0.36,0.62,0.79,0.82,0.68,0.44,0.19,0.12,0.12,0.25,0.5,0.73,0.85,0.8,0.63,0.4,0.21,0.13,0.19,0.35,0.54,0.67,0.71,0.63,0.49,0.35,0.25,0.22,0.27,0.36,0.44,0.49,0.49,0.47,0.43,0.4,0.37,0.33,0.3,0.27,0.25,0.26]
    },
    "updates": [
      {
        "id": "mina-u1",
        "dateLabel": "18 juillet",
        "title": "Le lieu principal est trouvé",
        "summary": "Une ancienne imprimerie accueillera le plan-séquence du refrain."
      },
      {
        "id": "mina-u2",
        "dateLabel": "8 juillet",
        "title": "Le costume final a été choisi",
        "summary": "La communauté a préféré la silhouette argentée parmi trois propositions."
      }
    ],
    "metrics": [
      {
        "id": "audience-engagee",
        "family": "audience",
        "title": "Une audience qui revient",
        "indicator": "+15 % d'auditeurs engagés",
        "explanation": "De plus en plus de personnes reviennent écouter et interagir avec les créations de l'artiste.",
        "values": [5900,6547,6732,7036,7772,8277]
      },
      {
        "id": "regularite-sorties",
        "family": "parcours",
        "title": "Un parcours régulier",
        "indicator": "10 sorties ou étapes publiées",
        "explanation": "Les étapes annoncées sont documentées afin que la communauté puisse suivre le travail accompli.",
        "values": [7,8,9,9,10,11]
      },
      {
        "id": "croissance-communaute",
        "family": "communaute",
        "title": "Une communauté qui se construit",
        "indicator": "238 membres actifs",
        "explanation": "Ce graphique suit le nombre de personnes qui accompagnent le projet, sans présumer d'un résultat financier.",
        "values": [129,148,156,167,188,204]
      }
    ],
    "editorialSelection": true
  },
  {
    "id": "awen",
    "name": "Awen",
    "gradeLevel": 2,
    "portrait": "/images/tremplin/artists/generated/awen-electronic-folk-rennes-v1.webp",
    "disciplines": ["Autrice","Guitariste"],
    "styles": ["Folk électronique","Chanson"],
    "city": "Rennes",
    "region": "Bretagne",
    "stageLabel": "Premiers titres",
    "biography": "Awen rassemble des fragments de voix, des guitares acoustiques et des sons enregistrés sur la côte. Elle prépare ses deux premiers titres accompagnée d'un producteur rennais.",
    "accent": {
      "primary": "#8f74ff",
      "secondary": "#34a4c9"
    },
    "artwork": "/images/tremplin/artists/generated/awen-electronic-folk-rennes-v1.webp",
    "community": {
      "memberCount": 84,
      "newMembers30Days": 36
    },
    "audio": {
      "title": "Écume",
      "subtitle": "Démo maison · 0:49",
      "durationLabel": "0:49",
      "audioSrc": "/media/preprofile-demo/hazy-after-hours.mp3",
      "waveform": [0.28,0.36,0.45,0.52,0.54,0.48,0.37,0.23,0.13,0.13,0.23,0.41,0.6,0.72,0.71,0.58,0.36,0.16,0.12,0.12,0.29,0.55,0.77,0.86,0.78,0.57,0.32,0.12,0.12,0.18,0.4,0.65,0.82,0.83,0.7,0.46,0.23,0.12,0.12,0.23,0.43,0.61,0.7,0.66,0.53,0.36,0.22,0.16,0.19,0.28,0.39,0.47,0.49,0.47,0.42,0.36]
    },
    "updates": [
      {
        "id": "awen-u1",
        "dateLabel": "16 juillet",
        "title": "Le violoncelle rejoint le projet",
        "summary": "Une instrumentiste rennaise a enregistré une première intention sur le refrain."
      },
      {
        "id": "awen-u2",
        "dateLabel": "5 juillet",
        "title": "Première écoute collective",
        "summary": "Trente-deux personnes ont partagé leurs impressions sur les deux maquettes."
      }
    ],
    "metrics": [
      {
        "id": "audience-engagee",
        "family": "audience",
        "title": "Une audience qui revient",
        "indicator": "+16 % d'auditeurs engagés",
        "explanation": "De plus en plus de personnes reviennent écouter et interagir avec les créations de l'artiste.",
        "values": [980,1088,1118,1169,1291,1375]
      },
      {
        "id": "regularite-sorties",
        "family": "parcours",
        "title": "Un parcours régulier",
        "indicator": "3 sorties ou étapes publiées",
        "explanation": "Les étapes annoncées sont documentées afin que la communauté puisse suivre le travail accompli.",
        "values": [1,1,1,1,1,2]
      },
      {
        "id": "croissance-communaute",
        "family": "communaute",
        "title": "Une communauté qui se construit",
        "indicator": "84 membres actifs",
        "explanation": "Ce graphique suit le nombre de personnes qui accompagnent le projet, sans présumer d'un résultat financier.",
        "values": [45,52,54,58,66,71]
      }
    ],
    "editorialSelection": false
  },
  {
    "id": "kelya-v",
    "name": "Kelya V",
    "gradeLevel": 2,
    "portrait": "/images/tremplin/artists/generated/kelya-v-urban-pop-toulouse-v1.webp",
    "disciplines": ["Chanteuse","Danseuse"],
    "exactProfession": "Chanteuse & danseuse",
    "roleId": "danseuse",
    "styles": ["Pop urbaine","Afro pop"],
    "city": "Nice",
    "region": "Provence-Alpes-Côte d'Azur",
    "stageLabel": "Show en préparation",
    "biography": "Kelya V associe écriture, danse et direction scénique. Elle prépare un format live court autour de quatre titres avant une première série de dates locales.",
    "accent": {
      "primary": "#9e67ff",
      "secondary": "#ff6b9e"
    },
    "artwork": "/images/tremplin/artists/generated/kelya-v-urban-pop-toulouse-v1.webp",
    "community": {
      "memberCount": 173,
      "newMembers30Days": 33
    },
    "audio": {
      "title": "Mouvement",
      "subtitle": "Version répétition · 0:58",
      "durationLabel": "0:58",
      "audioSrc": "/media/preprofile-demo/tech-house-vibes.mp3",
      "waveform": [0.25,0.24,0.26,0.3,0.33,0.37,0.4,0.43,0.47,0.49,0.47,0.42,0.34,0.26,0.22,0.25,0.36,0.51,0.64,0.7,0.65,0.51,0.32,0.17,0.13,0.22,0.43,0.66,0.82,0.84,0.71,0.47,0.22,0.12,0.12,0.23,0.48,0.71,0.83,0.78,0.59,0.33,0.12,0.12,0.12,0.27,0.5,0.68,0.73,0.63,0.44,0.24,0.12,0.12,0.15,0.3]
    },
    "updates": [
      {
        "id": "kelya-u1",
        "dateLabel": "14 juillet",
        "title": "La première chorégraphie est prête",
        "summary": "Le final du showcase a été répété en conditions réelles."
      },
      {
        "id": "kelya-u2",
        "dateLabel": "30 juin",
        "title": "Les quatre titres sont enchaînés",
        "summary": "Le set tient désormais en vingt-cinq minutes sans interruption."
      }
    ],
    "metrics": [
      {
        "id": "audience-engagee",
        "family": "audience",
        "title": "Une audience qui revient",
        "indicator": "+15 % d'auditeurs engagés",
        "explanation": "De plus en plus de personnes reviennent écouter et interagir avec les créations de l'artiste.",
        "values": [3600,3995,4108,4293,4742,5051]
      },
      {
        "id": "regularite-sorties",
        "family": "parcours",
        "title": "Un parcours régulier",
        "indicator": "6 sorties ou étapes publiées",
        "explanation": "Les étapes annoncées sont documentées afin que la communauté puisse suivre le travail accompli.",
        "values": [3,3,4,4,4,5]
      },
      {
        "id": "croissance-communaute",
        "family": "communaute",
        "title": "Une communauté qui se construit",
        "indicator": "173 membres actifs",
        "explanation": "Ce graphique suit le nombre de personnes qui accompagnent le projet, sans présumer d'un résultat financier.",
        "values": [93,106,113,121,136,147]
      }
    ],
    "editorialSelection": false
  },
  {
    "id": "soren-l",
    "name": "Soren L",
    "gradeLevel": 3,
    "portrait": "/images/tremplin/artists/guitar-session-v1.webp",
    "disciplines": ["Chanteur","Guitariste"],
    "exactProfession": "Chanteur & guitariste",
    "roleId": "guitariste-electrique",
    "styles": ["Indie rock","Post-punk"],
    "city": "Lille",
    "region": "Hauts-de-France",
    "stageLabel": "Tournée régionale",
    "biography": "Soren L a formé son groupe autour de chansons enregistrées seul. Après une première série de concerts complets à Lille, l'équipe prépare quatre dates dans les Hauts-de-France.",
    "accent": {
      "primary": "#765cff",
      "secondary": "#5b87ff"
    },
    "artwork": "/images/tremplin/artists/guitar-session-v1.webp",
    "community": {
      "memberCount": 247,
      "newMembers30Days": 24
    },
    "audio": {
      "title": "Façades",
      "subtitle": "Live à l'Aéronef · 1:16",
      "durationLabel": "1:16",
      "audioSrc": "/media/preprofile-demo/tech-house-vibes.mp3",
      "waveform": [0.52,0.6,0.58,0.47,0.33,0.23,0.18,0.22,0.3,0.39,0.46,0.49,0.49,0.47,0.45,0.43,0.41,0.38,0.35,0.33,0.33,0.38,0.47,0.57,0.64,0.65,0.58,0.45,0.31,0.21,0.21,0.32,0.51,0.69,0.78,0.74,0.58,0.34,0.14,0.12,0.12,0.3,0.55,0.74,0.8,0.7,0.46,0.2,0.12,0.12,0.12,0.34,0.58,0.72,0.71,0.56]
    },
    "updates": [
      {
        "id": "soren-u1",
        "dateLabel": "12 juillet",
        "title": "La quatrième date est confirmée",
        "summary": "Amiens rejoint Lille, Arras et Roubaix sur le parcours de novembre."
      },
      {
        "id": "soren-u2",
        "dateLabel": "1 juillet",
        "title": "Le public a choisi le rappel",
        "summary": "« Verre fumé » terminera les quatre concerts de la mini-tournée."
      }
    ],
    "metrics": [
      {
        "id": "audience-engagee",
        "family": "audience",
        "title": "Une audience qui revient",
        "indicator": "+15 % d'auditeurs engagés",
        "explanation": "De plus en plus de personnes reviennent écouter et interagir avec les créations de l'artiste.",
        "values": [6200,6880,7075,7394,8167,8698]
      },
      {
        "id": "regularite-sorties",
        "family": "parcours",
        "title": "Un parcours régulier",
        "indicator": "11 sorties ou étapes publiées",
        "explanation": "Les étapes annoncées sont documentées afin que la communauté puisse suivre le travail accompli.",
        "values": [8,9,10,11,12,13]
      },
      {
        "id": "croissance-communaute",
        "family": "communaute",
        "title": "Une communauté qui se construit",
        "indicator": "247 membres actifs",
        "explanation": "Ce graphique suit le nombre de personnes qui accompagnent le projet, sans présumer d'un résultat financier.",
        "values": [133,152,161,173,194,210]
      }
    ],
    "editorialSelection": false
  },
  {
    "id": "naim-o",
    "name": "Naïm O",
    "gradeLevel": 2,
    "portrait": "/images/tremplin/artists/naim-o-live-v1.webp",
    "disciplines": ["Chanteur","Claviériste"],
    "styles": ["Neo soul","Jazz contemporain"],
    "city": "Strasbourg",
    "region": "Grand Est",
    "stageLabel": "Session live en production",
    "biography": "Naïm O compose au Rhodes et construit sa musique avec un quartet. Il souhaite enregistrer une session live qui restitue l'énergie collective plutôt qu'un assemblage de prises séparées.",
    "accent": {
      "primary": "#a16dff",
      "secondary": "#d45ea8"
    },
    "artwork": "/images/tremplin/artists/naim-o-live-v1.webp",
    "community": {
      "memberCount": 159,
      "newMembers30Days": 22
    },
    "audio": {
      "title": "Chambre 7",
      "subtitle": "Répétition quartet · 1:02",
      "durationLabel": "1:02",
      "audioSrc": "/media/preprofile-demo/hazy-after-hours.mp3",
      "waveform": [0.25,0.12,0.12,0.12,0.25,0.48,0.65,0.7,0.61,0.45,0.27,0.16,0.15,0.23,0.37,0.51,0.59,0.59,0.54,0.47,0.4,0.36,0.36,0.38,0.4,0.43,0.46,0.5,0.54,0.57,0.58,0.56,0.48,0.38,0.28,0.24,0.28,0.39,0.54,0.66,0.7,0.62,0.45,0.24,0.12,0.12,0.17,0.37,0.6,0.74,0.73,0.58,0.33,0.12,0.12,0.12]
    },
    "updates": [
      {
        "id": "naim-u1",
        "dateLabel": "13 juillet",
        "title": "Le studio est réservé",
        "summary": "La grande salle sera disponible une journée entière au mois d'octobre."
      },
      {
        "id": "naim-u2",
        "dateLabel": "24 juin",
        "title": "Les arrangements sont validés",
        "summary": "Le quartet a retenu des versions plus ouvertes pour préserver l'improvisation."
      }
    ],
    "metrics": [
      {
        "id": "audience-engagee",
        "family": "audience",
        "title": "Une audience qui revient",
        "indicator": "+16 % d'auditeurs engagés",
        "explanation": "De plus en plus de personnes reviennent écouter et interagir avec les créations de l'artiste.",
        "values": [2600,2885,2967,3101,3425,3648]
      },
      {
        "id": "regularite-sorties",
        "family": "parcours",
        "title": "Un parcours régulier",
        "indicator": "6 sorties ou étapes publiées",
        "explanation": "Les étapes annoncées sont documentées afin que la communauté puisse suivre le travail accompli.",
        "values": [3,3,4,4,4,5]
      },
      {
        "id": "croissance-communaute",
        "family": "communaute",
        "title": "Une communauté qui se construit",
        "indicator": "159 membres actifs",
        "explanation": "Ce graphique suit le nombre de personnes qui accompagnent le projet, sans présumer d'un résultat financier.",
        "values": [86,98,104,112,125,136]
      }
    ],
    "editorialSelection": false
  },
  {
    "id": "yuna-vox",
    "name": "Yuna Vox",
    "gradeLevel": 3,
    "portrait": "/images/tremplin/artists/yuna-vox-live-v1.webp",
    "disciplines": ["Productrice","Chanteuse"],
    "exactProfession": "Productrice & chanteuse",
    "styles": ["Hyperpop","Electro pop"],
    "city": "Toulouse",
    "region": "Occitanie",
    "stageLabel": "Deuxième EP",
    "biography": "Yuna Vox produit et interprète ses morceaux. Son deuxième EP prolonge un univers très visuel avec des collaborations choisies pour sortir du travail entièrement solitaire.",
    "accent": {
      "primary": "#a451ff",
      "secondary": "#436dff"
    },
    "artwork": "/images/tremplin/artists/yuna-vox-live-v1.webp",
    "community": {
      "memberCount": 348,
      "newMembers30Days": 55
    },
    "audio": {
      "title": "Pixel tendre",
      "subtitle": "Pré-mix · 1:00",
      "durationLabel": "1:00",
      "audioSrc": "/media/preprofile-demo/tech-house-vibes.mp3",
      "waveform": [0.23,0.5,0.7,0.76,0.65,0.43,0.17,0.12,0.12,0.13,0.37,0.61,0.76,0.75,0.61,0.39,0.2,0.12,0.15,0.29,0.48,0.64,0.7,0.66,0.55,0.43,0.33,0.3,0.34,0.4,0.48,0.53,0.54,0.54,0.51,0.49,0.46,0.43,0.38,0.33,0.3,0.3,0.35,0.43,0.53,0.59,0.58,0.49,0.33,0.18,0.12,0.12,0.24,0.43,0.61,0.69]
    },
    "updates": [
      {
        "id": "yuna-u1",
        "dateLabel": "18 juillet",
        "title": "Les percussions sont enregistrées",
        "summary": "Une percussionniste a créé trois kits acoustiques transformés pour l'EP."
      },
      {
        "id": "yuna-u2",
        "dateLabel": "7 juillet",
        "title": "Le premier visualizer est storyboardé",
        "summary": "Les membres de la communauté ont commenté deux directions de narration avant le tournage."
      }
    ],
    "metrics": [
      {
        "id": "audience-engagee",
        "family": "audience",
        "title": "Une audience qui revient",
        "indicator": "+16 % d'auditeurs engagés",
        "explanation": "De plus en plus de personnes reviennent écouter et interagir avec les créations de l'artiste.",
        "values": [8500,9433,9699,10137,11197,11925]
      },
      {
        "id": "regularite-sorties",
        "family": "parcours",
        "title": "Un parcours régulier",
        "indicator": "13 sorties ou étapes publiées",
        "explanation": "Les étapes annoncées sont documentées afin que la communauté puisse suivre le travail accompli.",
        "values": [10,12,12,13,15,16]
      },
      {
        "id": "croissance-communaute",
        "family": "communaute",
        "title": "Une communauté qui se construit",
        "indicator": "348 membres actifs",
        "explanation": "Ce graphique suit le nombre de personnes qui accompagnent le projet, sans présumer d'un résultat financier.",
        "values": [188,215,228,244,274,297]
      }
    ],
    "editorialSelection": true
  },
  {
    "id": "olympe-404",
    "name": "Olympe 404",
    "gradeLevel": 2,
    "portrait": "/images/tremplin/artists/olympe-404-hybrid-live-v1.webp",
    "disciplines": ["DJ","Productrice"],
    "styles": ["Techno mélodique","Breakbeat"],
    "city": "Montpellier",
    "region": "Occitanie",
    "stageLabel": "Premier live hybride",
    "biography": "Après plusieurs DJ sets, Olympe 404 prépare un live hybride avec boîte à rythmes, synthétiseurs et séquences retravaillées en temps réel.",
    "accent": {
      "primary": "#835cff",
      "secondary": "#00a9d2"
    },
    "artwork": "/images/tremplin/artists/olympe-404-hybrid-live-v1.webp",
    "community": {
      "memberCount": 141,
      "newMembers30Days": 46
    },
    "audio": {
      "title": "Signal humain",
      "subtitle": "Extrait live · 1:10",
      "durationLabel": "1:10",
      "audioSrc": "/media/preprofile-demo/tech-house-vibes.mp3",
      "waveform": [0.56,0.38,0.17,0.12,0.12,0.14,0.37,0.61,0.76,0.76,0.6,0.35,0.12,0.12,0.12,0.24,0.51,0.73,0.83,0.76,0.56,0.32,0.14,0.12,0.19,0.39,0.61,0.76,0.79,0.68,0.5,0.33,0.22,0.22,0.3,0.42,0.54,0.59,0.58,0.52,0.44,0.38,0.34,0.32,0.33,0.33,0.35,0.37,0.4,0.44,0.48,0.49,0.45,0.37,0.26,0.16]
    },
    "updates": [
      {
        "id": "olympe-u1",
        "dateLabel": "17 juillet",
        "title": "Le dispositif tient cinquante minutes",
        "summary": "Le premier filage complet s'est déroulé sans ordinateur principal."
      },
      {
        "id": "olympe-u2",
        "dateLabel": "3 juillet",
        "title": "Deux transitions ont été réécrites",
        "summary": "Le live garde désormais son énergie sans rupture entre les tableaux."
      }
    ],
    "metrics": [
      {
        "id": "audience-engagee",
        "family": "audience",
        "title": "Une audience qui revient",
        "indicator": "+15 % d'auditeurs engagés",
        "explanation": "De plus en plus de personnes reviennent écouter et interagir avec les créations de l'artiste.",
        "values": [2400,2663,2739,2862,3162,3367]
      },
      {
        "id": "regularite-sorties",
        "family": "parcours",
        "title": "Un parcours régulier",
        "indicator": "5 sorties ou étapes publiées",
        "explanation": "Les étapes annoncées sont documentées afin que la communauté puisse suivre le travail accompli.",
        "values": [2,2,2,3,3,3]
      },
      {
        "id": "croissance-communaute",
        "family": "communaute",
        "title": "Une communauté qui se construit",
        "indicator": "141 membres actifs",
        "explanation": "Ce graphique suit le nombre de personnes qui accompagnent le projet, sans présumer d'un résultat financier.",
        "values": [76,87,92,99,111,120]
      }
    ],
    "editorialSelection": false
  },
  {
    "id": "malik-j",
    "name": "Malik J",
    "gradeLevel": 4,
    "portrait": "/images/tremplin/artists/malik-j-sax-live-v1.webp",
    "disciplines": ["Saxophoniste","Compositeur"],
    "styles": ["Jazz hip-hop","Broken beat"],
    "city": "Bordeaux",
    "region": "Nouvelle-Aquitaine",
    "stageLabel": "Album collectif",
    "biography": "Malik J réunit un quintet et plusieurs beatmakers autour d'un album conçu entre improvisation et montage. Chaque titre documente un lieu et une rencontre.",
    "accent": {
      "primary": "#9c67ff",
      "secondary": "#e178b4"
    },
    "artwork": "/images/tremplin/artists/malik-j-sax-live-v1.webp",
    "community": {
      "memberCount": 412,
      "newMembers30Days": 38
    },
    "audio": {
      "title": "Traversée III",
      "subtitle": "Prise studio · 1:18",
      "durationLabel": "1:18",
      "audioSrc": "/media/preprofile-demo/hazy-after-hours.mp3",
      "waveform": [0.19,0.26,0.38,0.51,0.59,0.59,0.49,0.32,0.16,0.12,0.12,0.27,0.49,0.69,0.77,0.71,0.52,0.28,0.12,0.12,0.14,0.37,0.64,0.82,0.86,0.73,0.49,0.25,0.12,0.12,0.25,0.48,0.7,0.81,0.77,0.61,0.39,0.2,0.12,0.16,0.31,0.48,0.61,0.64,0.59,0.47,0.34,0.25,0.22,0.25,0.31,0.37,0.41,0.43,0.42,0.41]
    },
    "updates": [
      {
        "id": "malik-u1",
        "dateLabel": "10 juillet",
        "title": "Les cuivres de six titres sont enregistrés",
        "summary": "Le quintet a conservé plusieurs prises complètes pour préserver le mouvement."
      },
      {
        "id": "malik-u2",
        "dateLabel": "22 juin",
        "title": "Le journal de session est ouvert",
        "summary": "Chaque journée de studio donne lieu à une note, une photo et un extrait audio."
      }
    ],
    "metrics": [
      {
        "id": "audience-engagee",
        "family": "audience",
        "title": "Une audience qui revient",
        "indicator": "+15 % d'auditeurs engagés",
        "explanation": "De plus en plus de personnes reviennent écouter et interagir avec les créations de l'artiste.",
        "values": [9100,10098,10384,10853,11987,12767]
      },
      {
        "id": "regularite-sorties",
        "family": "parcours",
        "title": "Un parcours régulier",
        "indicator": "14 sorties ou étapes publiées",
        "explanation": "Les étapes annoncées sont documentées afin que la communauté puisse suivre le travail accompli.",
        "values": [11,13,14,15,16,18]
      },
      {
        "id": "croissance-communaute",
        "family": "communaute",
        "title": "Une communauté qui se construit",
        "indicator": "412 membres actifs",
        "explanation": "Ce graphique suit le nombre de personnes qui accompagnent le projet, sans présumer d'un résultat financier.",
        "values": [222,254,269,288,324,350]
      }
    ],
    "editorialSelection": true
  },
  {
    "id": "zelie-north",
    "name": "Zélie North",
    "gradeLevel": 2,
    "portrait": "/images/tremplin/artists/zelie-north-studio-v1.webp",
    "disciplines": ["Autrice","Productrice"],
    "styles": ["Chanson électronique","Dream pop"],
    "city": "Grenoble",
    "region": "Auvergne-Rhône-Alpes",
    "stageLabel": "Premier EP",
    "biography": "Zélie North a d'abord écrit pour d'autres interprètes. Elle porte aujourd'hui ses propres chansons et prépare un premier EP accompagné par une réalisatrice artistique.",
    "accent": {
      "primary": "#846dff",
      "secondary": "#538cff"
    },
    "artwork": "/images/tremplin/artists/zelie-north-studio-v1.webp",
    "community": {
      "memberCount": 96,
      "newMembers30Days": 41
    },
    "audio": {
      "title": "Relief",
      "subtitle": "Maquette · 0:52",
      "durationLabel": "0:52",
      "audioSrc": "/media/preprofile-demo/hazy-after-hours.mp3",
      "waveform": [0.34,0.31,0.3,0.29,0.28,0.28,0.31,0.37,0.45,0.52,0.56,0.52,0.42,0.3,0.19,0.17,0.24,0.4,0.58,0.72,0.75,0.65,0.45,0.24,0.12,0.12,0.27,0.51,0.74,0.87,0.83,0.64,0.38,0.14,0.12,0.12,0.3,0.56,0.76,0.82,0.72,0.5,0.25,0.12,0.12,0.15,0.35,0.55,0.67,0.67,0.55,0.37,0.21,0.12,0.13,0.22]
    },
    "updates": [
      {
        "id": "zelie-u1",
        "dateLabel": "18 juillet",
        "title": "Le quatrième texte est terminé",
        "summary": "L'EP possède désormais une trajectoire complète, de l'arrivée au départ."
      },
      {
        "id": "zelie-u2",
        "dateLabel": "9 juillet",
        "title": "Les premières maquettes sont partagées",
        "summary": "Les membres de la communauté peuvent écouter deux versions et commenter leur ressenti."
      }
    ],
    "metrics": [
      {
        "id": "audience-engagee",
        "family": "audience",
        "title": "Une audience qui revient",
        "indicator": "+16 % d'auditeurs engagés",
        "explanation": "De plus en plus de personnes reviennent écouter et interagir avec les créations de l'artiste.",
        "values": [1100,1221,1255,1312,1449,1543]
      },
      {
        "id": "regularite-sorties",
        "family": "parcours",
        "title": "Un parcours régulier",
        "indicator": "3 sorties ou étapes publiées",
        "explanation": "Les étapes annoncées sont documentées afin que la communauté puisse suivre le travail accompli.",
        "values": [1,1,1,1,1,2]
      },
      {
        "id": "croissance-communaute",
        "family": "communaute",
        "title": "Une communauté qui se construit",
        "indicator": "96 membres actifs",
        "explanation": "Ce graphique suit le nombre de personnes qui accompagnent le projet, sans présumer d'un résultat financier.",
        "values": [52,60,63,67,76,82]
      }
    ],
    "editorialSelection": false
  },
  {
    "id": "cassandre-bleu",
    "name": "Cassandre Bleu",
    "gradeLevel": 2,
    "portrait": "/images/tremplin/artists/generated/cassandre-bleu-harp-strasbourg-v1.webp",
    "disciplines": ["Harpiste","Compositrice"],
    "styles": ["Néo-classique","Dream pop"],
    "city": "Strasbourg",
    "region": "Grand Est",
    "stageLabel": "Pièces pour harpe et voix en production",
    "biography": "Cassandre Bleu compose pour harpe, voix et textures électriques. Son nouveau cycle réunit un trio à cordes et une équipe image autour de six pièces originales.",
    "roleId": "violoniste",
    "accent": {
      "primary": "#746aff",
      "secondary": "#507dff"
    },
    "artwork": "/images/tremplin/artists/generated/cassandre-bleu-harp-strasbourg-v1.webp",
    "community": {
      "memberCount": 132,
      "newMembers30Days": 29
    },
    "audio": {
      "title": "Presque là",
      "subtitle": "Répétition · 0:57",
      "durationLabel": "0:57",
      "audioSrc": "/media/preprofile-demo/hazy-after-hours.mp3",
      "waveform": [0.39,0.51,0.55,0.52,0.43,0.33,0.27,0.25,0.28,0.32,0.37,0.41,0.44,0.46,0.49,0.5,0.49,0.45,0.39,0.31,0.27,0.28,0.37,0.5,0.64,0.71,0.69,0.58,0.4,0.23,0.15,0.19,0.36,0.58,0.76,0.82,0.72,0.51,0.25,0.12,0.12,0.14,0.38,0.63,0.78,0.78,0.62,0.37,0.12,0.12,0.12,0.18,0.41,0.62,0.71,0.65]
    },
    "updates": [
      {
        "id": "cassandre-u1",
        "dateLabel": "15 juillet",
        "title": "La prise de harpe définitive est choisie",
        "summary": "Une interprétation complète a été retenue pour conserver le souffle et les résonances de la salle."
      },
      {
        "id": "cassandre-u2",
        "dateLabel": "29 juin",
        "title": "Le décor du clip est confirmé",
        "summary": "Une ancienne salle de spectacle accueillera le tournage avant son ouverture."
      }
    ],
    "metrics": [
      {
        "id": "audience-engagee",
        "family": "audience",
        "title": "Une audience qui revient",
        "indicator": "+16 % d'auditeurs engagés",
        "explanation": "De plus en plus de personnes reviennent écouter et interagir avec les créations de l'artiste.",
        "values": [1900,2108,2168,2266,2503,2666]
      },
      {
        "id": "regularite-sorties",
        "family": "parcours",
        "title": "Un parcours régulier",
        "indicator": "5 sorties ou étapes publiées",
        "explanation": "Les étapes annoncées sont documentées afin que la communauté puisse suivre le travail accompli.",
        "values": [2,2,2,3,3,3]
      },
      {
        "id": "croissance-communaute",
        "family": "communaute",
        "title": "Une communauté qui se construit",
        "indicator": "132 membres actifs",
        "explanation": "Ce graphique suit le nombre de personnes qui accompagnent le projet, sans présumer d'un résultat financier.",
        "values": [71,81,86,92,103,112]
      }
    ],
    "editorialSelection": false
  },
  {
    "id": "anis-valeur",
    "name": "Anis Valeur",
    "gradeLevel": 3,
    "portrait": "/images/tremplin/artists/generated/anis-valeur-music-director-paris-v1.webp",
    "disciplines": ["Réalisateur de clips","Auteur audiovisuel"],
    "styles": ["Clip narratif","Session musicale"],
    "city": "Saint-Denis",
    "region": "Île-de-France",
    "stageLabel": "Projet audiovisuel",
    "biography": "Anis Valeur écrit et réalise des formats musicaux narratifs. Son prochain projet relie quatre morceaux par une histoire continue filmée dans plusieurs lieux de Saint-Denis.",
    "roleId": "videaste-clipper",
    "accent": {
      "primary": "#915cff",
      "secondary": "#3f7cff"
    },
    "artwork": "/images/tremplin/artists/generated/anis-valeur-music-director-paris-v1.webp",
    "community": {
      "memberCount": 379,
      "newMembers30Days": 47
    },
    "audio": {
      "title": "Plein cadre",
      "subtitle": "Extrait épisode 2 · 1:04",
      "durationLabel": "1:04",
      "audioSrc": "/media/preprofile-demo/tech-house-vibes.mp3",
      "waveform": [0.41,0.19,0.12,0.12,0.14,0.33,0.52,0.64,0.64,0.54,0.4,0.27,0.2,0.22,0.3,0.4,0.49,0.53,0.54,0.51,0.48,0.45,0.43,0.41,0.39,0.37,0.38,0.41,0.48,0.56,0.63,0.64,0.59,0.47,0.32,0.21,0.18,0.26,0.43,0.61,0.73,0.72,0.59,0.38,0.16,0.12,0.12,0.21,0.45,0.67,0.77,0.71,0.5,0.23,0.12,0.12]
    },
    "updates": [
      {
        "id": "anis-u1",
        "dateLabel": "16 juillet",
        "title": "Le deuxième épisode est tourné",
        "summary": "La scène principale a été filmée en lumière naturelle avec douze figurants."
      },
      {
        "id": "anis-u2",
        "dateLabel": "4 juillet",
        "title": "Une projection de travail a réuni l'équipe",
        "summary": "Les membres locaux de la communauté ont vu les premières images et échangé avec les techniciens."
      }
    ],
    "metrics": [
      {
        "id": "audience-engagee",
        "family": "audience",
        "title": "Une audience qui revient",
        "indicator": "+16 % d'auditeurs engagés",
        "explanation": "De plus en plus de personnes reviennent écouter et interagir avec les créations de l'artiste.",
        "values": [7400,8212,8444,8825,9748,10382]
      },
      {
        "id": "regularite-sorties",
        "family": "parcours",
        "title": "Un parcours régulier",
        "indicator": "12 sorties ou étapes publiées",
        "explanation": "Les étapes annoncées sont documentées afin que la communauté puisse suivre le travail accompli.",
        "values": [9,10,11,12,13,15]
      },
      {
        "id": "croissance-communaute",
        "family": "communaute",
        "title": "Une communauté qui se construit",
        "indicator": "379 membres actifs",
        "explanation": "Ce graphique suit le nombre de personnes qui accompagnent le projet, sans présumer d'un résultat financier.",
        "values": [205,235,248,266,299,323]
      }
    ],
    "editorialSelection": true
  },
  {
    "id": "maya-chen",
    "name": "Maya Chen",
    "gradeLevel": 4,
    "portrait": "/images/tremplin/artists/maya-chen-studio-v1.webp",
    "disciplines": ["Beatmakeuse","Ingénieure du son"],
    "styles": ["UK garage","Future beats"],
    "city": "Paris",
    "region": "Île-de-France",
    "stageLabel": "Premier projet d'artiste",
    "biography": "Connue comme productrice pour d'autres artistes, Maya Chen prépare un premier projet sous son nom. Elle invite plusieurs voix à écrire autour de ses compositions.",
    "accent": {
      "primary": "#a45cff",
      "secondary": "#466bff"
    },
    "artwork": "/images/tremplin/artists/maya-chen-studio-v1.webp",
    "community": {
      "memberCount": 322,
      "newMembers30Days": 51
    },
    "audio": {
      "title": "Common Ground 02",
      "subtitle": "Instrumental · 1:09",
      "durationLabel": "1:09",
      "audioSrc": "/media/preprofile-demo/tech-house-vibes.mp3",
      "waveform": [0.12,0.32,0.58,0.74,0.74,0.58,0.34,0.12,0.12,0.12,0.22,0.46,0.65,0.74,0.69,0.53,0.34,0.2,0.16,0.22,0.36,0.51,0.62,0.65,0.6,0.52,0.43,0.38,0.37,0.38,0.41,0.44,0.46,0.48,0.51,0.53,0.54,0.52,0.46,0.37,0.28,0.23,0.24,0.33,0.47,0.59,0.65,0.61,0.46,0.27,0.12,0.12,0.12,0.28,0.51,0.67]
    },
    "updates": [
      {
        "id": "maya-u1",
        "dateLabel": "18 juillet",
        "title": "La troisième voix est enregistrée",
        "summary": "Une chanteuse londonienne a terminé les prises principales et les harmonies."
      },
      {
        "id": "maya-u2",
        "dateLabel": "6 juillet",
        "title": "Premier carnet de production publié",
        "summary": "Maya détaille le chemin du sample brut jusqu'à l'arrangement final."
      }
    ],
    "metrics": [
      {
        "id": "audience-engagee",
        "family": "audience",
        "title": "Une audience qui revient",
        "indicator": "+16 % d'auditeurs engagés",
        "explanation": "De plus en plus de personnes reviennent écouter et interagir avec les créations de l'artiste.",
        "values": [7800,8656,8900,9302,10275,10943]
      },
      {
        "id": "regularite-sorties",
        "family": "parcours",
        "title": "Un parcours régulier",
        "indicator": "15 sorties ou étapes publiées",
        "explanation": "Les étapes annoncées sont documentées afin que la communauté puisse suivre le travail accompli.",
        "values": [12,14,15,16,18,20]
      },
      {
        "id": "croissance-communaute",
        "family": "communaute",
        "title": "Une communauté qui se construit",
        "indicator": "322 membres actifs",
        "explanation": "Ce graphique suit le nombre de personnes qui accompagnent le projet, sans présumer d'un résultat financier.",
        "values": [174,199,211,226,254,275]
      }
    ],
    "editorialSelection": true
  }
];

type GeneratedTremplinArtistSeed = {
  id: string;
  name: string;
  gradeLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  image: string;
  disciplines: readonly string[];
  exactProfession?: string;
  styles: readonly string[];
  city: string;
  region: string;
  stageLabel: string;
  biography: string;
  audioTitle: string;
  isAiArtist?: boolean;
  roleId?: import("./tremplinRoleData").TremplinRoleId;
  project?: TremplinProjectSnapshot;
};

/**
 * Portraits éditoriaux 2026 générés pour le mur des projets.
 * Les identités sont fictives et restent cantonnées au mode démonstration.
 * La série privilégie volontairement les voix, puis quelques instrumentistes
 * et DJ, sans recycler un même visage sous plusieurs profils.
 */
const wall2026ArtistSeeds: readonly GeneratedTremplinArtistSeed[] = [
  { id: "soraya-kells", name: "Soraya Kells", gradeLevel: 3, image: "/images/tremplin/artists/wall-2026/soraya-kells-alt-rnb-lyon-v1.webp", disciplines: ["Chanteuse", "Autrice-compositrice"], exactProfession: "Chanteuse & autrice", styles: ["R&B alternatif", "Soul nocturne"], city: "Lyon", region: "Auvergne-Rhône-Alpes", stageLabel: "EP R&B en enregistrement", biography: "Soraya façonne un R&B organique où les harmonies vocales restent au premier plan. Elle termine les prises de son premier EP.", audioTitle: "Velours brut", roleId: "chanteuse-rappeuse" },
  { id: "amel-nero", name: "Amel Nero", gradeLevel: 2, image: "/images/tremplin/artists/wall-2026/amel-nero-trap-soul-marseille-v1.webp", disciplines: ["Rappeuse", "Chanteuse"], exactProfession: "Rappeuse & chanteuse", styles: ["Trap-soul", "Rap mélodique"], city: "Marseille", region: "Provence-Alpes-Côte d'Azur", stageLabel: "Première session live en préparation", biography: "Amel relie textes directs et refrains soul. Son équipe prépare une première session filmée dans un décor brut.", audioTitle: "Marée noire", roleId: "chanteuse-rappeuse" },
  { id: "keo-marin", name: "Kéo Marin", gradeLevel: 3, image: "/images/tremplin/artists/wall-2026/keo-marin-indie-pop-lille-v1.webp", disciplines: ["Chanteur", "Auteur-compositeur"], exactProfession: "Chanteur & auteur-compositeur", styles: ["Indie pop", "Dream pop"], city: "Lille", region: "Hauts-de-France", stageLabel: "Album guitare-voix en préproduction", biography: "Kéo écrit une pop intime portée par des guitares claires. Il assemble les maquettes de son premier album long format.", audioTitle: "Fenêtre nord", roleId: "chanteur-rappeur" },
  { id: "lina-nox", name: "Lina Nox", gradeLevel: 3, image: "/images/tremplin/artists/wall-2026/lina-nox-electro-pop-grenoble-v1.webp", disciplines: ["Chanteuse", "Interprète"], exactProfession: "Chanteuse & interprète", styles: ["Electro-pop", "Pop alternative"], city: "Grenoble", region: "Auvergne-Rhône-Alpes", stageLabel: "Nouveau live électronique en répétition", biography: "Lina construit un set vocal précis autour de synthétiseurs compacts et de lumières réactives.", audioTitle: "Altitude zéro", roleId: "chanteuse-rappeuse" },
  { id: "ana-rose", name: "Ana Rose", gradeLevel: 2, image: "/images/tremplin/artists/wall-2026/ana-rose-neo-soul-bordeaux-v1.webp", disciplines: ["Chanteuse", "Autrice"], exactProfession: "Chanteuse & autrice", styles: ["Néo-soul", "R&B"], city: "Bordeaux", region: "Nouvelle-Aquitaine", stageLabel: "Trois titres soul en finition", biography: "Ana privilégie les prises vocales vivantes et des arrangements sobres. Trois morceaux sont en phase de mixage.", audioTitle: "Derrière la vitre", roleId: "chanteuse-rappeuse" },
  { id: "fatou-lyne", name: "Fatou Lyne", gradeLevel: 3, image: "/images/tremplin/artists/wall-2026/fatou-lyne-afropop-saint-denis-v1.webp", disciplines: ["Chanteuse", "Interprète"], exactProfession: "Chanteuse", styles: ["Afropop", "Soul africaine"], city: "Saint-Denis", region: "Île-de-France", stageLabel: "Show afropop en résidence", biography: "Fatou prépare un spectacle chaleureux où la voix dialogue avec les percussions et les chœurs.", audioTitle: "Soleil commun", roleId: "chanteuse-rappeuse" },
  { id: "clara-mensah", name: "Clara Mensah", gradeLevel: 4, image: "/images/tremplin/artists/wall-2026/clara-mensah-gospel-soul-bordeaux-v1.webp", disciplines: ["Chanteuse", "Cheffe de chœur"], exactProfession: "Chanteuse soul", styles: ["Gospel-soul", "Soul"], city: "Bordeaux", region: "Nouvelle-Aquitaine", stageLabel: "Concert vocal collectif en création", biography: "Clara réunit un chœur et une section rythmique pour un concert pensé autour de la transmission.", audioTitle: "Open Hands", roleId: "chanteuse-rappeuse" },
  { id: "nina-zola", name: "Nina Zola", gradeLevel: 2, image: "/images/tremplin/artists/wall-2026/nina-zola-punk-pop-clermont-v1.webp", disciplines: ["Chanteuse", "Autrice"], exactProfession: "Chanteuse punk-pop", styles: ["Punk-pop", "Rock alternatif"], city: "Clermont-Ferrand", region: "Auvergne-Rhône-Alpes", stageLabel: "Premier set punk-pop en répétition", biography: "Nina écrit des chansons courtes et nerveuses. Son trio cherche la forme définitive d'un premier set de trente minutes.", audioTitle: "Pas sage", roleId: "chanteuse-rappeuse" },
  { id: "valerie-dias", name: "Valérie Dias", gradeLevel: 5, image: "/images/tremplin/artists/wall-2026/valerie-dias-soul-jazz-nancy-v1.webp", disciplines: ["Chanteuse", "Interprète"], exactProfession: "Chanteuse soul-jazz", styles: ["Soul-jazz", "Jazz vocal"], city: "Nancy", region: "Grand Est", stageLabel: "Répertoire jazz vocal en réorchestration", biography: "Valérie revisite vingt années de scène avec un quartet plus acoustique et de nouveaux arrangements.", audioTitle: "Après minuit", roleId: "chanteuse-rappeuse" },
  { id: "leila-nouri", name: "Leïla Nouri", gradeLevel: 4, image: "/images/tremplin/artists/wall-2026/leila-nouri-rai-pop-lyon-v1.webp", disciplines: ["Chanteuse", "Autrice"], exactProfession: "Chanteuse raï-pop", styles: ["Raï-pop", "Pop maghrébine"], city: "Lyon", region: "Auvergne-Rhône-Alpes", stageLabel: "Nouveau spectacle raï-pop", biography: "Leïla relie mélodies raï et production pop contemporaine. Le nouveau spectacle entre en répétition générale.", audioTitle: "Deux rives", roleId: "chanteuse-rappeuse" },
  { id: "celeste-yang", name: "Céleste Yang", gradeLevel: 2, image: "/images/tremplin/artists/wall-2026/celeste-yang-dream-pop-strasbourg-v1.webp", disciplines: ["Chanteuse", "Compositrice"], exactProfession: "Chanteuse & compositrice", styles: ["Dream pop", "Ambient pop"], city: "Strasbourg", region: "Grand Est", stageLabel: "EP dream-pop en écriture", biography: "Céleste superpose voix feutrées et synthèses lentes. Elle documente l'écriture de cinq nouveaux morceaux.", audioTitle: "Pluie oblique", roleId: "chanteuse-rappeuse" },
  { id: "idris-velour", name: "Idris Velour", gradeLevel: 4, image: "/images/tremplin/artists/wall-2026/idris-velour-neo-soul-paris-v1.webp", disciplines: ["Chanteur", "Auteur-compositeur"], exactProfession: "Chanteur néo-soul", styles: ["Néo-soul", "R&B organique"], city: "Paris", region: "Île-de-France", stageLabel: "Live néo-soul en résidence", biography: "Idris travaille un live sans bandes additionnelles, porté par la voix, la basse et les claviers.", audioTitle: "Sans détour", roleId: "chanteur-rappeur" },
  { id: "nabil-roux", name: "Nabil Roux", gradeLevel: 4, image: "/images/tremplin/artists/wall-2026/nabil-roux-rap-grenoble-v1.webp", disciplines: ["Rappeur", "Auteur"], exactProfession: "Rappeur & auteur", styles: ["Rap conscient", "Hip-hop"], city: "Grenoble", region: "Auvergne-Rhône-Alpes", stageLabel: "Album narratif en écriture", biography: "Nabil construit un album autour des trajectoires de quartier, avec une documentation précise des crédits.", audioTitle: "Arrière-boutique", roleId: "chanteur-rappeur" },
  { id: "noemie-chen", name: "Noémie Chen", gradeLevel: 3, image: "/images/tremplin/artists/wall-2026/noemie-chen-cello-metz-v1.webp", disciplines: ["Violoncelliste", "Compositrice"], exactProfession: "Violoncelliste", styles: ["Néo-classique", "Musique de chambre"], city: "Metz", region: "Grand Est", stageLabel: "Suite pour violoncelle en enregistrement", biography: "Noémie prépare une suite où le violoncelle acoustique dialogue avec des nappes discrètes.", audioTitle: "Arches lentes", roleId: "violoniste" },
  { id: "yusuf-kora", name: "Yusuf Kora", gradeLevel: 4, image: "/images/tremplin/artists/wall-2026/yusuf-kora-saint-denis-v1.webp", disciplines: ["Joueur de kora", "Compositeur"], exactProfession: "Joueur de kora", styles: ["Afro-jazz", "Musique mandingue"], city: "Saint-Denis", region: "Île-de-France", stageLabel: "Trio kora et jazz en résidence", biography: "Yusuf fait circuler la kora entre tradition mandingue et improvisation contemporaine.", audioTitle: "Cordes de ville", roleId: "violoniste" },
  { id: "naima-volt", name: "Naïma Volt", gradeLevel: 3, image: "/images/tremplin/artists/wall-2026/naima-volt-afro-house-lille-v1.webp", disciplines: ["DJ", "Productrice"], exactProfession: "DJ & productrice", styles: ["Afro-house", "Deep house"], city: "Lille", region: "Hauts-de-France", stageLabel: "Nouveau set afro-house en préparation", biography: "Naïma construit une progression lente et percussive pensée pour les petites salles et les Rooms.", audioTitle: "Volt Sequence", roleId: "dj" },
  { id: "eliot-zen", name: "Eliot Zen", gradeLevel: 3, image: "/images/tremplin/artists/wall-2026/eliot-zen-drum-bass-rennes-v1.webp", disciplines: ["DJ", "Sélecteur"], exactProfession: "DJ", styles: ["Drum & bass", "Bass music"], city: "Rennes", region: "Bretagne", stageLabel: "Set drum & bass en reconstruction", biography: "Eliot travaille une sélection rapide mais lisible, avec des transitions préparées pour un format radio filmé.", audioTitle: "Zen Pressure", roleId: "dj" },
  { id: "elise-morel", name: "Élise Morel", gradeLevel: 3, image: "/images/tremplin/artists/wall-2026/elise-morel-chanson-electro-nantes-v1.webp", disciplines: ["Chanteuse", "Autrice-compositrice"], exactProfession: "Chanteuse & autrice", styles: ["Chanson électronique", "Art pop"], city: "Nantes", region: "Pays de la Loire", stageLabel: "Album chanson-électronique en composition", biography: "Élise associe texte frontal et synthétiseurs analogiques dans un album construit en studio de répétition.", audioTitle: "Bords de Loire", roleId: "chanteuse-rappeuse" },
  { id: "maelle-ocean", name: "Maëlle Océan", gradeLevel: 5, image: "/images/tremplin/artists/wall-2026/maelle-ocean-reggae-fort-de-france-v1.webp", disciplines: ["Chanteuse", "Autrice"], exactProfession: "Chanteuse reggae", styles: ["Reggae contemporain", "Roots"], city: "Fort-de-France", region: "Martinique", stageLabel: "Concert en plein air en préparation", biography: "Maëlle prépare un concert généreux où les textes intimes rencontrent une section rythmique caribéenne.", audioTitle: "Alizé", roleId: "chanteuse-rappeuse" },
  { id: "alex-serein", name: "Alex Serein", gradeLevel: 2, image: "/images/tremplin/artists/wall-2026/alex-serein-art-pop-paris-v1.webp", disciplines: ["Interprète", "Auteur-compositeur"], exactProfession: "Interprète art-pop", styles: ["Art pop", "Electronica"], city: "Paris", region: "Île-de-France", stageLabel: "Performance art-pop en prototypage", biography: "Alex conçoit une performance minimale centrée sur la voix, l'espace et une lumière en mouvement.", audioTitle: "Angle mort", roleId: "chanteuse-rappeuse" },
  { id: "rayan-sable", name: "Rayan Sable", gradeLevel: 4, image: "/images/tremplin/artists/wall-2026/rayan-sable-chanson-soul-toulouse-v1.webp", disciplines: ["Chanteur", "Auteur-compositeur"], exactProfession: "Chanteur chanson-soul", styles: ["Chanson-soul", "Pop acoustique"], city: "Toulouse", region: "Occitanie", stageLabel: "Répertoire piano-voix en finition", biography: "Rayan recentre ses chansons sur la voix et le piano avant une première captation en public.", audioTitle: "Le sable et l'heure", roleId: "chanteur-rappeur" },
  { id: "ines-azur", name: "Inès Azur", gradeLevel: 3, image: "/images/tremplin/artists/wall-2026/ines-azur-pop-urbaine-nice-v1.webp", disciplines: ["Chanteuse", "Interprète"], exactProfession: "Chanteuse pop urbaine", styles: ["Pop urbaine", "R&B"], city: "Nice", region: "Provence-Alpes-Côte d'Azur", stageLabel: "Showcase pop en préparation", biography: "Inès prépare un showcase court où chaque titre possède sa propre couleur scénique.", audioTitle: "Azur minuit", roleId: "chanteuse-rappeuse" },
  { id: "omar-lys", name: "Omar Lys", gradeLevel: 4, image: "/images/tremplin/artists/wall-2026/omar-lys-gospel-pop-rouen-v1.webp", disciplines: ["Chanteur", "Interprète"], exactProfession: "Chanteur gospel-pop", styles: ["Gospel-pop", "Soul"], city: "Rouen", region: "Normandie", stageLabel: "Projet vocal collectif en répétition", biography: "Omar rassemble plusieurs voix autour de chansons originales et d'arrangements choraux documentés.", audioTitle: "Lys ouvert", roleId: "chanteur-rappeur" },
  { id: "awa-ciel", name: "Awa Ciel", gradeLevel: 3, image: "/images/tremplin/artists/wall-2026/awa-ciel-afro-soul-reims-v1.webp", disciplines: ["Chanteuse", "Autrice"], exactProfession: "Chanteuse afro-soul", styles: ["Afro-soul", "Soul"], city: "Reims", region: "Grand Est", stageLabel: "Harmonies du premier EP en cours", biography: "Awa enregistre les harmonies de son premier EP avec une équipe réduite et des arrangements organiques.", audioTitle: "Ciel bas", roleId: "chanteuse-rappeuse" },
  { id: "camille-neri", name: "Camille Neri", gradeLevel: 4, image: "/images/tremplin/artists/wall-2026/camille-neri-chanson-rock-tours-v1.webp", disciplines: ["Chanteuse", "Guitariste"], exactProfession: "Chanteuse rock", styles: ["Chanson-rock", "Rock alternatif"], city: "Tours", region: "Centre-Val de Loire", stageLabel: "Nouvel album en répétition", biography: "Camille teste de nouveaux arrangements plus directs avec son groupe avant l'entrée en studio.", audioTitle: "Ville rapide", roleId: "chanteuse-rappeuse" },
  { id: "theo-lune", name: "Théo Lune", gradeLevel: 2, image: "/images/tremplin/artists/wall-2026/theo-lune-alt-pop-angers-v1.webp", disciplines: ["Chanteur", "Compositeur"], exactProfession: "Chanteur alt-pop", styles: ["Alt-pop", "Bedroom pop"], city: "Angers", region: "Pays de la Loire", stageLabel: "Premières chansons en production", biography: "Théo transforme ses maquettes de chambre en un projet scénique simple et cohérent.", audioTitle: "Sous les toits", roleId: "chanteur-rappeur" },
  { id: "jade-falco", name: "Jade Falco", gradeLevel: 2, image: "/images/tremplin/artists/wall-2026/jade-falco-rap-melodique-toulon-v1.webp", disciplines: ["Rappeuse", "Autrice"], exactProfession: "Rappeuse mélodique", styles: ["Rap mélodique", "Trap-soul"], city: "Toulon", region: "Provence-Alpes-Côte d'Azur", stageLabel: "Mixtape en écriture", biography: "Jade alterne couplets secs et refrains mélodiques dans une mixtape construite avec trois beatmakers.", audioTitle: "Falco", roleId: "chanteuse-rappeuse" },
  { id: "meryem-kaal", name: "Meryem Kaal", gradeLevel: 4, image: "/images/tremplin/artists/wall-2026/meryem-kaal-indie-rai-montpellier-v1.webp", disciplines: ["Chanteuse", "Autrice"], exactProfession: "Chanteuse indie-raï", styles: ["Indie-raï", "Pop alternative"], city: "Montpellier", region: "Occitanie", stageLabel: "Live indie-raï en préparation", biography: "Meryem mêle phrasés raï, guitares claires et textures électroniques dans un nouveau set.", audioTitle: "Kaal lumière", roleId: "chanteuse-rappeuse" },
  { id: "samuel-dray", name: "Samuel Dray", gradeLevel: 4, image: "/images/tremplin/artists/wall-2026/samuel-dray-chanson-folk-rennes-v1.webp", disciplines: ["Chanteur", "Guitariste"], exactProfession: "Chanteur folk", styles: ["Chanson-folk", "Indie acoustique"], city: "Rennes", region: "Bretagne", stageLabel: "Album acoustique en prises", biography: "Samuel enregistre un album acoustique centré sur la voix, la guitare et les silences de la pièce.", audioTitle: "Bois calme", roleId: "chanteur-rappeur" },
  { id: "lila-onyx", name: "Lila Onyx", gradeLevel: 2, image: "/images/tremplin/artists/wall-2026/lila-onyx-hyperpop-metz-v1.webp", disciplines: ["Chanteuse", "Autrice"], exactProfession: "Chanteuse hyperpop", styles: ["Hyperpop", "Electro-pop"], city: "Metz", region: "Grand Est", stageLabel: "Premier live hyperpop en prototypage", biography: "Lila cherche un format scénique physique sans masquer la voix sous les effets de production.", audioTitle: "Onyx.exe", roleId: "chanteuse-rappeuse" },
  { id: "eva-mistral", name: "Eva Mistral", gradeLevel: 5, image: "/images/tremplin/artists/wall-2026/eva-mistral-jazz-pop-avignon-v1.webp", disciplines: ["Chanteuse", "Interprète"], exactProfession: "Chanteuse jazz-pop", styles: ["Jazz-pop", "Chanson"], city: "Avignon", region: "Provence-Alpes-Côte d'Azur", stageLabel: "Nouveau quartet en résidence", biography: "Eva réorchestre son répertoire pour un quartet acoustique et une série de petites salles.", audioTitle: "Mistral doux", roleId: "chanteuse-rappeuse" },
  { id: "dario-silva", name: "Dario Silva", gradeLevel: 3, image: "/images/tremplin/artists/wall-2026/dario-silva-latin-pop-perpignan-v1.webp", disciplines: ["Chanteur", "Auteur-compositeur"], exactProfession: "Chanteur latin-pop", styles: ["Latin pop", "Pop acoustique"], city: "Perpignan", region: "Occitanie", stageLabel: "EP bilingue en production", biography: "Dario prépare un EP bilingue où les guitares acoustiques laissent toute la place aux voix.", audioTitle: "Deux langues", roleId: "chanteur-rappeur" },
  { id: "noa-kemi", name: "Noa Kemi", gradeLevel: 3, image: "/images/tremplin/artists/wall-2026/noa-kemi-alt-rnb-besancon-v1.webp", disciplines: ["Interprète", "Auteur-compositeur"], exactProfession: "Interprète R&B alternatif", styles: ["R&B alternatif", "Electronica"], city: "Besançon", region: "Bourgogne-Franche-Comté", stageLabel: "Projet R&B en arrangement", biography: "Noa travaille un R&B intime à partir de voix proches et de textures électroniques discrètes.", audioTitle: "Kemi Room", roleId: "chanteuse-rappeuse" },
  { id: "salome-faye", name: "Salomé Faye", gradeLevel: 4, image: "/images/tremplin/artists/wall-2026/salome-faye-electro-chanson-amiens-v1.webp", disciplines: ["Chanteuse", "Compositrice"], exactProfession: "Chanteuse électro-chanson", styles: ["Electro-chanson", "Art pop"], city: "Amiens", region: "Hauts-de-France", stageLabel: "Album électronique en finition", biography: "Salomé associe écriture francophone et synthèse modulaire dans un album presque achevé.", audioTitle: "Nord magnétique", roleId: "chanteuse-rappeuse" },
  { id: "kylian-osei", name: "Kylian Osei", gradeLevel: 3, image: "/images/tremplin/artists/wall-2026/kylian-osei-rap-melodique-saint-etienne-v1.webp", disciplines: ["Rappeur", "Chanteur"], exactProfession: "Rappeur & chanteur", styles: ["Rap mélodique", "R&B"], city: "Saint-Étienne", region: "Auvergne-Rhône-Alpes", stageLabel: "Session live rap en préparation", biography: "Kylian adapte ses morceaux pour une session live avec clavier, batterie et voix sans playback.", audioTitle: "Ruban noir", roleId: "chanteur-rappeur" },
  { id: "lucie-varenne", name: "Lucie Varenne", gradeLevel: 4, image: "/images/tremplin/artists/wall-2026/lucie-varenne-violin-lille-v1.webp", disciplines: ["Violoniste", "Compositrice"], exactProfession: "Violoniste", styles: ["Néo-classique", "Musique contemporaine"], city: "Lille", region: "Hauts-de-France", stageLabel: "Pièces pour violon en répétition", biography: "Lucie prépare un cycle de pièces courtes pour violon, lumière et espace acoustique.", audioTitle: "Varenne I", roleId: "violoniste" },
  { id: "matteo-cruz", name: "Matteo Cruz", gradeLevel: 4, image: "/images/tremplin/artists/wall-2026/matteo-cruz-guitar-lyon-v1.webp", disciplines: ["Guitariste", "Compositeur"], exactProfession: "Guitariste électrique", styles: ["Jazz-rock", "Soul instrumentale"], city: "Lyon", region: "Auvergne-Rhône-Alpes", stageLabel: "Trio instrumental en studio", biography: "Matteo enregistre un trio où la guitare conserve une place mélodique plutôt que démonstrative.", audioTitle: "Cruz Line", roleId: "guitariste-electrique" },
  { id: "adele-kim", name: "Adèle Kim", gradeLevel: 4, image: "/images/tremplin/artists/wall-2026/adele-kim-piano-strasbourg-v1.webp", disciplines: ["Pianiste", "Compositrice"], exactProfession: "Pianiste", styles: ["Néo-classique", "Piano contemporain"], city: "Strasbourg", region: "Grand Est", stageLabel: "Album pour piano en répétition", biography: "Adèle prépare un album pour piano seul enregistré dans une salle à l'acoustique naturelle.", audioTitle: "Pluie sur les touches", roleId: "pianiste" },
  { id: "malick-doumbia", name: "Malick Doumbia", gradeLevel: 5, image: "/images/tremplin/artists/wall-2026/malick-doumbia-sax-marseille-v1.webp", disciplines: ["Saxophoniste", "Compositeur"], exactProfession: "Saxophoniste", styles: ["Jazz contemporain", "Afro-jazz"], city: "Marseille", region: "Provence-Alpes-Côte d'Azur", stageLabel: "Quartet jazz en résidence", biography: "Malick fait dialoguer improvisation, rythmes ouest-africains et écriture de quartet.", audioTitle: "Doumbia Passage", roleId: "instrumentiste-vent" },
  { id: "irina-petrov", name: "Irina Petrov", gradeLevel: 4, image: "/images/tremplin/artists/wall-2026/irina-petrov-drums-bordeaux-v1.webp", disciplines: ["Batteuse", "Compositrice"], exactProfession: "Batteuse", styles: ["Rock alternatif", "Jazz moderne"], city: "Bordeaux", region: "Nouvelle-Aquitaine", stageLabel: "Set batterie et électronique en création", biography: "Irina construit un set où batterie acoustique et déclenchements électroniques restent joués en direct.", audioTitle: "Petrov Pulse", roleId: "batteur-batteuse" },
  { id: "tom-aznar", name: "Tom Aznar", gradeLevel: 3, image: "/images/tremplin/artists/wall-2026/tom-aznar-bass-toulouse-v1.webp", disciplines: ["Bassiste", "Compositeur"], exactProfession: "Bassiste", styles: ["Funk alternatif", "Neo-soul"], city: "Toulouse", region: "Occitanie", stageLabel: "Live basse et voix en répétition", biography: "Tom prépare un set compact où la basse porte les arrangements et laisse respirer les interprètes.", audioTitle: "Aznar Low", roleId: "bassiste" },
  { id: "sia-corail", name: "Sia Corail", gradeLevel: 3, image: "/images/tremplin/artists/wall-2026/sia-corail-house-dj-nantes-v1.webp", disciplines: ["DJ", "Productrice"], exactProfession: "DJ house", styles: ["House", "Deep house"], city: "Nantes", region: "Pays de la Loire", stageLabel: "Set house en préparation", biography: "Sia construit un set chaleureux pensé pour une progression continue plutôt que des effets faciles.", audioTitle: "Corail House", roleId: "dj" },
  { id: "malik-orion", name: "Malik Orion", gradeLevel: 4, image: "/images/tremplin/artists/wall-2026/malik-orion-techno-dj-dijon-v1.webp", disciplines: ["DJ", "Producteur"], exactProfession: "DJ techno", styles: ["Techno", "Electronica"], city: "Dijon", region: "Bourgogne-Franche-Comté", stageLabel: "Live techno hybride en répétition", biography: "Malik combine sélection et contrôleurs live dans un format documenté et reproductible.", audioTitle: "Orion Module", roleId: "dj" },
  { id: "lou-sato", name: "Lou Sato", gradeLevel: 2, image: "/images/tremplin/artists/wall-2026/lou-sato-uk-garage-dj-paris-v1.webp", disciplines: ["DJ", "Sélection"], exactProfession: "DJ UK garage", styles: ["UK garage", "Bass music"], city: "Paris", region: "Île-de-France", stageLabel: "Première émission filmée en préparation", biography: "Lou prépare une émission courte qui relie sélection UK garage et présentation des artistes invités.", audioTitle: "Sato Radio", roleId: "dj" },
  { id: "yasmine-dune", name: "Yasmine Dune", gradeLevel: 3, image: "/images/tremplin/artists/wall-2026/yasmine-dune-amapiano-dj-lyon-v1.webp", disciplines: ["DJ", "Productrice"], exactProfession: "DJ amapiano", styles: ["Amapiano", "Afro-house"], city: "Lyon", region: "Auvergne-Rhône-Alpes", stageLabel: "Set amapiano avec percussion en création", biography: "Yasmine prépare un set qui fait dialoguer sélection amapiano et percussion jouée en direct.", audioTitle: "Dune Log", roleId: "dj" },
];

const generatedArtistSeeds: readonly GeneratedTremplinArtistSeed[] = [
  ...wall2026ArtistSeeds,
  {
    id: "lior-benali", name: "Lior Benali", gradeLevel: 2,
    image: "/images/tremplin/artists/generated/lior-benali-guitar-v1.webp",
    disciplines: ["Guitariste", "Compositeur"], styles: ["Flamenco alternatif", "Indie pop"],
    city: "Toulouse", region: "Occitanie", stageLabel: "Live acoustique en création",
    biography: "Lior transforme le flamenco en paysages indie lumineux. Son nouveau live associe guitare nylon, pédales analogiques et arrangements vocaux.",
    audioTitle: "Lignes de feu", roleId: "guitariste-acoustique",
  },
  {
    id: "anais-kor", name: "Anaïs Kor", gradeLevel: 3,
    image: "/images/tremplin/artists/generated/anais-kor-cello-v1.webp",
    disciplines: ["Violoncelliste", "Compositrice"], styles: ["Néo-classique", "Cinematic"],
    city: "Montpellier", region: "Occitanie", stageLabel: "Premier album cinématique",
    biography: "Anaïs compose des pièces pour violoncelle préparé et électronique douce. Elle finalise un premier album pensé comme une bande originale imaginaire.",
    audioTitle: "Chambre 7",
  },
  {
    id: "demba-flow", name: "Demba Flow", gradeLevel: 3,
    image: "/images/tremplin/artists/generated/demba-flow-percussion-v1.webp",
    disciplines: ["Percussionniste", "Interprète"], styles: ["Afrobeat", "Afro-jazz"],
    city: "Paris", region: "Île-de-France", stageLabel: "Ensemble live en répétition",
    biography: "Demba relie polyrythmies d'Afrique de l'Ouest, cuivres et textures électroniques. Son collectif prépare une série de sessions filmées.",
    audioTitle: "Kora District",
  },
  {
    id: "clara-volt", name: "Clara Volt", gradeLevel: 2,
    image: "/images/tremplin/artists/generated/clara-volt-sound-design-v1.webp",
    disciplines: ["Sound designer", "Field recordist"], styles: ["Electronica", "Ambient"],
    city: "Dijon", region: "Bourgogne-Franche-Comté", stageLabel: "Installation sonore en production",
    biography: "Clara capture des sons urbains et naturels pour fabriquer des œuvres immersives. Elle développe une installation mêlant projection et spatialisation.",
    audioTitle: "Matière mobile",
  },
  {
    id: "jules-orion", name: "Jules Orion", gradeLevel: 2,
    image: "/images/tremplin/artists/generated/jules-orion-indie-pop-v1.webp",
    disciplines: ["Chanteur", "Auteur-compositeur"], styles: ["Indie pop", "Dream pop"],
    city: "Bordeaux", region: "Nouvelle-Aquitaine", stageLabel: "EP en finition",
    biography: "Jules écrit une pop nocturne portée par des guitares aériennes. Il cherche à réunir son équipe visuelle autour de cinq nouveaux titres.",
    audioTitle: "Orbite lente",
  },
  {
    id: "aina-sol", name: "Aïna Sol", gradeLevel: 4,
    image: "/images/tremplin/artists/generated/aina-sol-dj-productrice-afro-house-bordeaux-v1.webp",
    disciplines: ["DJ", "Productrice"], styles: ["Afro house", "Amapiano organique"],
    city: "Bordeaux", region: "Nouvelle-Aquitaine", stageLabel: "Show club en développement",
    biography: "Aïna construit des sets progressifs où percussions organiques et synthés profonds se répondent. Son prochain show intègre une scénographie réactive.",
    audioTitle: "Solstice Club",
  },
  {
    id: "ilyne-k", name: "Ilyne K", gradeLevel: 3,
    image: "/images/tremplin/artists/generated/ilyne-k-rappeuse-drill-lille-v1.webp",
    disciplines: ["Rappeuse", "Autrice"], styles: ["Drill alternative", "Rap"],
    city: "Lille", region: "Hauts-de-France", stageLabel: "Mixtape en écriture",
    biography: "Ilyne détourne les codes de la drill avec des harmonies sombres et une écriture très visuelle. Sa nouvelle mixtape rassemble six producteurs européens.",
    audioTitle: "Hors cadre",
  },
  {
    id: "elio-serra", name: "Elio Serra", gradeLevel: 4,
    image: "/images/tremplin/artists/generated/elio-serra-ingenieur-son-montpellier-v1.webp",
    disciplines: ["Ingénieur du son", "Mixeur"], styles: ["Recording", "Mixage"],
    city: "Montpellier", region: "Occitanie", stageLabel: "Studio mobile en lancement",
    biography: "Elio accompagne des groupes indépendants de la prise au master. Il développe un studio mobile destiné aux captations live hors des grandes villes.",
    audioTitle: "Room Tone 04",
  },
  {
    id: "maia-kuroda", name: "Maïa Kuroda", gradeLevel: 3,
    image: "/images/tremplin/artists/generated/maia-kuroda-violoniste-neo-classique-nantes-v1.webp",
    disciplines: ["Violoniste", "Compositrice"], styles: ["Néo-classique", "Ambient"],
    city: "Nantes", region: "Pays de la Loire", stageLabel: "Performance audiovisuelle",
    biography: "Maïa superpose violon, boucles granuleuses et lumière programmée. Elle prépare une performance immersive avec deux artistes visuels nantais.",
    audioTitle: "Verre liquide",
  },
  {
    id: "sekou-mare", name: "Sékou Maré", gradeLevel: 3,
    image: "/images/tremplin/artists/generated/sekou-mare-danseur-choregraphe-marseille-v1.webp",
    disciplines: ["Danseur", "Chorégraphe"], styles: ["Contemporain", "Hip-hop expérimental"],
    city: "Marseille", region: "Provence-Alpes-Côte d'Azur", stageLabel: "Création scénique collective",
    biography: "Sékou compose une danse physique entre hip-hop et mouvement contemporain. Sa nouvelle pièce associe trois danseurs et une création sonore originale.",
    audioTitle: "Corps francs",
  },
  {
    id: "luma-vale", name: "Luma Vale", gradeLevel: 2,
    image: "/images/tremplin/artists/generated/ai-synth-rnb-singer-luma-vale.webp",
    disciplines: ["Chanteuse virtuelle", "Autrice IA"], styles: ["Synth-R&B", "Future soul"],
    city: "Paris", region: "Île-de-France", stageLabel: "Artiste IA · premier cycle",
    biography: "Luma Vale est une artiste virtuelle développée autour d'une voix synthétique expressive et d'une direction artistique nocturne. Son univers est piloté par un collectif humain.",
    audioTitle: "Soft Signal", isAiArtist: true,
  },
  {
    id: "north-static", name: "North Static", gradeLevel: 2,
    image: "/images/tremplin/artists/generated/ai-electro-duo-north-static.webp",
    disciplines: ["Duo virtuel", "Producteurs IA"], styles: ["Electro", "Future garage"],
    city: "Lyon", region: "Auvergne-Rhône-Alpes", stageLabel: "Artiste IA · live génératif",
    biography: "North Static est un duo virtuel conçu par deux producteurs lyonnais. Leur live génératif réagit aux rythmes et aux interactions du public.",
    audioTitle: "Polar Memory", isAiArtist: true,
  },
  {
    id: "kairo-grid", name: "Kairo Grid", gradeLevel: 2,
    image: "/images/tremplin/artists/generated/ai-beatmaker-kairo-grid.webp",
    disciplines: ["Beatmaker IA", "Producteur virtuel"], styles: ["Hip-hop", "Broken beat"],
    city: "Marseille", region: "Provence-Alpes-Côte d'Azur", stageLabel: "Artiste IA · beat tape évolutive",
    biography: "Kairo Grid est un beatmaker virtuel dont les patterns sont curatés puis réarrangés par une équipe de musiciens marseillais. Chaque sortie garde une empreinte humaine documentée.",
    audioTitle: "Gridline 91", isAiArtist: true,
  },
  {
    id: "aren-veil", name: "Aren Veil", gradeLevel: 2,
    image: "/images/tremplin/artists/generated/ai-futuristic-pop-singer-aren-veil.webp",
    disciplines: ["Chanteur virtuel", "Interprète IA"], styles: ["Future pop", "Synth pop"],
    city: "Lille", region: "Hauts-de-France", stageLabel: "Artiste IA · identité en développement",
    biography: "Aren Veil explore une pop synthétique bilingue imaginée avec des auteurs et producteurs humains. La communauté suit publiquement les choix de voix et de narration.",
    audioTitle: "Glass Weather", isAiArtist: true,
  },
  {
    id: "naoko-serein", name: "Naoko Serein", gradeLevel: 2,
    image: "/images/tremplin/artists/generated/ai-ambient-composer-naoko-serein.webp",
    disciplines: ["Compositrice IA", "Artiste virtuelle"], styles: ["Ambient", "Néo-classique"],
    city: "Nantes", region: "Pays de la Loire", stageLabel: "Artiste IA · album immersif",
    biography: "Naoko Serein est un projet de composition assistée par IA, dirigé par une équipe de musiciens et designers sonores. Les pièces mêlent piano traité, cordes et paysages naturels.",
    audioTitle: "Still Harbour", isAiArtist: true,
  },
  {
    id: "samra-flux", name: "Samra Flux", gradeLevel: 2,
    image: "/images/tremplin/artists/generated/ai-rap-artist-samra-flux.webp",
    disciplines: ["Rappeuse virtuelle", "Autrice IA"], styles: ["Rap alternatif", "Bass music"],
    city: "Roubaix", region: "Hauts-de-France", stageLabel: "Artiste IA · manifeste audiovisuel",
    biography: "Samra Flux est une rappeuse virtuelle portée par une équipe d'auteurs, réalisateurs et producteurs du Nord. Son identité évolue au fil de capsules documentées.",
    audioTitle: "Angle mort", isAiArtist: true,
  },
  {
    id: "elior-saint", name: "Elior Saint", gradeLevel: 2,
    image: "/images/tremplin/artists/generated/ai-modern-jazz-artist-elior-saint.webp",
    disciplines: ["Saxophoniste virtuel", "Compositeur IA"], styles: ["Jazz moderne", "Nu jazz"],
    exactProfession: "Saxophoniste virtuel & compositeur IA", roleId: "instrumentiste-vent",
    city: "Bordeaux", region: "Nouvelle-Aquitaine", stageLabel: "Artiste IA · quartet hybride",
    biography: "Elior Saint explore un jazz moderne composé avec assistance générative puis interprété et réarrangé par un quartet humain bordelais.",
    audioTitle: "Velvet Transit", isAiArtist: true,
  },
  {
    id: "amina-sola", name: "Amina Sola", gradeLevel: 2,
    image: "/images/tremplin/artists/generated/ai-afrofuturist-artist-amina-sola.webp",
    disciplines: ["Productrice IA", "Artiste virtuelle"], styles: ["Afro-électronique", "Afro-futurisme"],
    city: "Montpellier", region: "Occitanie", stageLabel: "Artiste IA · univers transmedia",
    biography: "Amina Sola est un projet afro-futuriste conçu par un collectif de musiciens et designers. Les compositions génératives sont rejouées avec des percussions réelles.",
    audioTitle: "Solar Ancestry", isAiArtist: true,
  },
  {
    id: "vesper-k", name: "Vesper K", gradeLevel: 2,
    image: "/images/tremplin/artists/generated/ai-techno-producer-vesper-k.webp",
    disciplines: ["Productrice virtuelle", "Live performer IA"], styles: ["Techno", "Live hardware"],
    city: "Strasbourg", region: "Grand Est", stageLabel: "Artiste IA · live hardware",
    biography: "Vesper K relie séquences génératives et machines analogiques manipulées en direct. Le protocole de création et les interventions humaines sont rendus visibles.",
    audioTitle: "Machine Bloom", isAiArtist: true,
  },
  {
    id: "solis-miro", name: "Solis Miro", gradeLevel: 2,
    image: "/images/tremplin/artists/generated/ai-experimental-voice-solis-miro.webp",
    disciplines: ["Voix virtuelle", "Interprète IA"], styles: ["Voix expérimentale", "Art pop"],
    city: "Toulouse", region: "Occitanie", stageLabel: "Artiste IA · performance vocale",
    biography: "Solis Miro transforme une voix synthétique en matière chorale. Des vocalistes humains réinterprètent ensuite les partitions pour construire la performance scénique.",
    audioTitle: "Breath Syntax", isAiArtist: true, roleId: "chanteuse-rappeuse",
  },
  {
    id: "nabil-orsen", name: "Nabil Orsen", gradeLevel: 2,
    image: "/images/tremplin/artists/generated/ai-film-composer-nabil-orsen.webp",
    disciplines: ["Compositeur IA", "Orchestrateur virtuel"], styles: ["Musique de film", "Néo-classique"],
    city: "Bruxelles", region: "Bruxelles-Capitale", stageLabel: "Artiste IA · bande originale",
    biography: "Nabil Orsen développe des bandes originales assistées par IA, orchestrées et enregistrées par des instrumentistes. Son premier cycle accompagne trois courts métrages.",
    audioTitle: "The Long Frame", isAiArtist: true,
  },
  {
    id: "malik-soren", name: "Malik Soren", gradeLevel: 4,
    image: "/images/tremplin/artists/generated/malik-soren-chanteur-soul-strasbourg-v1.webp",
    disciplines: ["Chanteur", "Auteur-compositeur"], styles: ["Néo-soul", "Gospel contemporain"],
    city: "Strasbourg", region: "Grand Est", stageLabel: "Session live en préparation",
    biography: "Malik porte une soul ample nourrie par les harmonies gospel. Il prépare une session filmée entouré d'un chœur et d'un trio organique.",
    audioTitle: "Carry the Light",
  },
  {
    id: "liora-fado", name: "Liora Fado", gradeLevel: 3,
    image: "/images/tremplin/artists/generated/liora-fado-rappeuse-drill-toulouse-v1.webp",
    disciplines: ["Rappeuse", "Autrice"], styles: ["Drill alternative", "Rap hybride"],
    city: "Toulouse", region: "Occitanie", stageLabel: "Premier live augmenté",
    biography: "Liora fait dialoguer une écriture frontale, des rythmiques drill et des refrains presque pop. Son premier live se construit avec une scénographie lumineuse minimale.",
    audioTitle: "Latitude 43",
  },
  {
    id: "vera-kline", name: "Véra Kline", gradeLevel: 4,
    image: "/images/tremplin/artists/generated/vera-kline-dj-techno-lyon-v1.webp",
    disciplines: ["DJ", "Live performeuse"], styles: ["Techno minimale", "Live club"],
    city: "Lyon", region: "Auvergne-Rhône-Alpes", stageLabel: "Live hardware en résidence",
    biography: "Véra compose un club sonore précis à partir de machines analogiques et de textures enregistrées la nuit. Sa résidence lyonnaise affine un nouveau set hybride.",
    audioTitle: "Concrete Pulse",
  },
  {
    id: "idriss-ngoma", name: "Idriss N'Goma", gradeLevel: 3,
    image: "/images/tremplin/artists/generated/idriss-ngoma-percussionniste-world-rennes-v1.webp",
    disciplines: ["Percussionniste", "Compositeur"], styles: ["World fusion", "Afro-latin"],
    city: "Rennes", region: "Bretagne", stageLabel: "Ensemble transatlantique",
    biography: "Idriss relie polyrythmies mandingues, grooves afro-latins et improvisation. Il rassemble un ensemble rennais pour enregistrer une série de prises live.",
    audioTitle: "Trois rives",
  },
  {
    id: "anjali-veyra", name: "Anjali Veyra", gradeLevel: 4,
    image: "/images/tremplin/artists/generated/anjali-veyra-danseuse-choregraphe-nice-v1.webp",
    disciplines: ["Danseuse", "Chorégraphe"], styles: ["Danse contemporaine", "Waacking"],
    city: "Nice", region: "Provence-Alpes-Côte d'Azur", stageLabel: "Création chorégraphique",
    biography: "Anjali construit une écriture chorégraphique nerveuse entre waacking et mouvement contemporain. Sa nouvelle pièce répond à une création électronique originale.",
    audioTitle: "Angles solaires",
  },
  {
    id: "nils-bensaid", name: "Nils Bensaïd", gradeLevel: 4,
    image: "/images/tremplin/artists/generated/nils-bensaid-trompettiste-jazz-paris-v1.webp",
    disciplines: ["Trompettiste", "Compositeur"], styles: ["Jazz contemporain", "Broken beat"],
    city: "Paris", region: "Île-de-France", stageLabel: "Quartet en studio",
    biography: "Nils mêle cuivre acoustique, batterie cassée et traitements électroniques. Son quartet prépare un disque pensé comme une suite nocturne continue.",
    audioTitle: "Dernier métro",
  },
  {
    id: "ines-raku", name: "Inès Raku", gradeLevel: 3,
    image: "/images/tremplin/artists/generated/ines-raku-drummer-marseille-v1.webp",
    disciplines: ["Batteuse", "Productrice rythmique"], styles: ["Afro-rock", "Broken beat"],
    city: "Marseille", region: "Provence-Alpes-Côte d'Azur", stageLabel: "Trio rythmique en création",
    biography: "Inès écrit ses morceaux depuis la batterie. Elle fait se rencontrer riffs afro-rock, silences abrupts et textures de studio dans un trio sans basse.",
    audioTitle: "Port battant",
  },
  {
    id: "thea-novak", name: "Théa Novak", gradeLevel: 3,
    image: "/images/tremplin/artists/generated/thea-novak-pianist-nancy-v2.webp",
    disciplines: ["Pianiste", "Compositrice"], styles: ["Néo-classique", "Ambient"],
    exactProfession: "Pianiste amateur · Néo-classique",
    city: "Nancy", region: "Grand Est", stageLabel: "Cycle pour piano en finition",
    biography: "Théa compose des pièces courtes où le piano respire au milieu de nappes très fines. Son premier cycle est enregistré dans une salle à l'acoustique minérale.",
    audioTitle: "Craie froide", roleId: "pianiste",
  },
  {
    id: "jules-ndoye", name: "Jules N'Doye", gradeLevel: 4,
    image: "/images/tremplin/artists/generated/jules-ndoye-bassist-bordeaux-v1.webp",
    disciplines: ["Bassiste", "Musicien de session"], styles: ["Néo-soul", "Funk moderne"],
    city: "Bordeaux", region: "Nouvelle-Aquitaine", stageLabel: "Album groove en préproduction",
    biography: "Jules place la basse au centre de compositions néo-soul chaleureuses. Il prépare un disque collectif enregistré en conditions live sur bande.",
    audioTitle: "Low Season",
  },
  {
    id: "soraya-bell", name: "Soraya Bell", gradeLevel: 4,
    image: "/images/tremplin/artists/generated/soraya-bell-sound-engineer-lille-v1.webp",
    disciplines: ["Ingénieure du son", "Productrice"], styles: ["Techno organique", "Mix immersif"],
    city: "Lille", region: "Hauts-de-France", stageLabel: "Studio immersif en développement",
    biography: "Soraya construit des mixes profonds à partir de prises acoustiques et de synthèse modulaire. Son projet documente chaque choix de spatialisation.",
    audioTitle: "Rain Console",
  },
  {
    id: "leon-vasseur", name: "Léon Vasseur", gradeLevel: 4,
    image: "/images/tremplin/artists/generated/leon-vasseur-music-director-rouen-v1.webp",
    disciplines: ["Réalisateur musical", "Arrangeur"], styles: ["Pop alternative", "Orchestration"],
    city: "Rouen", region: "Normandie", stageLabel: "Album d'artiste en réalisation",
    biography: "Léon orchestre des chansons alternatives avec une attention particulière aux timbres et aux respirations. Il accompagne actuellement trois jeunes interprètes normands.",
    audioTitle: "Bois dormant",
  },
  {
    id: "imani-kader", name: "Imani Kader", gradeLevel: 4,
    image: "/images/tremplin/artists/generated/imani-kader-saxophonist-montpellier-v1.webp",
    disciplines: ["Saxophoniste", "Compositrice"], styles: ["Jazz électronique", "Afrobeat"],
    city: "Montpellier", region: "Occitanie", stageLabel: "Live solaire en résidence",
    biography: "Imani fait dialoguer saxophone ténor, séquenceurs et rythmiques afrobeat. Sa résidence prépare une performance où chaque boucle reste jouée en direct.",
    audioTitle: "Petroleum Sun",
  },
  {
    id: "celiane-aube", name: "Céliane Aube", gradeLevel: 3,
    image: "/images/tremplin/artists/generated/artist-contemporary-lyric-singer-celiane-aube.webp",
    disciplines: ["Chanteuse lyrique", "Interprète"], styles: ["Lyrique contemporain", "Néo-classique"],
    city: "Nice", region: "Provence-Alpes-Côte d'Azur", stageLabel: "Récital contemporain en création",
    biography: "Céliane fait sortir la voix lyrique du récital traditionnel. Elle prépare un format scénique intime mêlant électronique lente, voix nue et lumière.",
    audioTitle: "Après l'orage",
  },
  {
    id: "kenji-ravel", name: "Kenji Ravel", gradeLevel: 3,
    image: "/images/tremplin/artists/generated/artist-alt-metal-drummer-kenji-ravel.webp",
    disciplines: ["Batteur", "Compositeur"], styles: ["Metal alternatif", "Post-metal"],
    city: "Rennes", region: "Bretagne", stageLabel: "Live lourd en répétition",
    biography: "Kenji compose à partir de motifs de batterie asymétriques et de masses de guitare. Son trio travaille un spectacle tendu, sans séquences préenregistrées.",
    audioTitle: "Fer calme",
  },
  {
    id: "noah-belair", name: "Noah Belair", gradeLevel: 3,
    image: "/images/tremplin/artists/generated/artist-reggae-dub-singer-noah-belair.webp",
    disciplines: ["Chanteur", "Auteur"], styles: ["Reggae", "Dub"],
    city: "Saint-Denis", region: "Île-de-France", stageLabel: "Soundsystem live en montage",
    biography: "Noah écrit un reggae urbain porté par des lignes de basse profondes et une approche dub analogique. Il monte un soundsystem live avec des musiciens de Saint-Denis.",
    audioTitle: "Rue ouverte",
  },
  {
    id: "mina-lattice", name: "Mina Lattice", gradeLevel: 3,
    image: "/images/tremplin/artists/generated/artist-live-coding-electronic-mina-lattice.webp",
    disciplines: ["Artiste live-coding", "Productrice"], styles: ["Electronica", "IDM"],
    city: "Lyon", region: "Auvergne-Rhône-Alpes", stageLabel: "Performance générative en bêta",
    biography: "Mina écrit la musique en direct comme une partition visible. Sa performance lie code, gestes sur contrôleurs et projection sans masquer le processus créatif.",
    audioTitle: "Compile Me",
  },
  {
    id: "toma-silex", name: "Toma Silex", gradeLevel: 2,
    image: "/images/tremplin/artists/generated/artist-slam-poet-toma-silex.webp",
    disciplines: ["Slameur", "Poète"], styles: ["Spoken word", "Néo-soul"],
    city: "Nancy", region: "Grand Est", stageLabel: "Recueil scénique en écriture",
    biography: "Toma pose une poésie précise sur des harmonies néo-soul dépouillées. Il transforme un nouveau recueil en spectacle sonore pour voix, basse et projections.",
    audioTitle: "Marges vivantes",
  },
  {
    id: "idriss-noor", name: "Idriss Noor", gradeLevel: 4,
    image: "/images/tremplin/artists/generated/idriss-noor-oud-compositeur-paris-v1.webp",
    disciplines: ["Oudiste", "Compositeur"], styles: ["Musique contemporaine", "Oriental électronique"],
    roleId: "violoniste",
    city: "Paris", region: "Île-de-France", stageLabel: "Suite instrumentale en production",
    biography: "Idriss fait dialoguer oud acoustique, synthèse granulaire et silences cinématiques. Il enregistre une suite dédiée aux villes méditerranéennes.",
    audioTitle: "Atlas nocturne",
  },
  {
    id: "ophelie-grant", name: "Ophélie Grant", gradeLevel: 4,
    image: "/images/tremplin/artists/generated/ophelie-grant-soprano-cinematic-lyon-v1.webp",
    disciplines: ["Soprano", "Vocaliste"], styles: ["Lyrique cinématique", "Musique de film"],
    city: "Lyon", region: "Auvergne-Rhône-Alpes", stageLabel: "Album vocal cinématique",
    biography: "Ophélie superpose voix lyrique, harmonies chorales et textures de bande originale. Son album cherche un équilibre entre puissance et proximité.",
    audioTitle: "Cobalt Aria",
  },
  {
    id: "min-jae-lune", name: "Min-Jae Lune", gradeLevel: 3,
    image: "/images/tremplin/artists/generated/min-jae-lune-flute-electro-jazz-grenoble-v1.webp",
    disciplines: ["Flûtiste", "Producteur"], styles: ["Jazz électronique", "Ambient"],
    city: "Grenoble", region: "Auvergne-Rhône-Alpes", stageLabel: "Duo électro-acoustique",
    biography: "Min-Jae fait respirer la flûte au milieu d'une électronique modulaire très organique. Son duo développe une forme live sans piste figée.",
    audioTitle: "Altitude variable",
  },
  {
    id: "noa-prism", name: "Noa Prism", gradeLevel: 3,
    image: "/images/tremplin/artists/generated/noa-prism-live-coding-nonbinary-paris-v1.webp",
    disciplines: ["Artiste live-coding", "Performer audiovisuel"], styles: ["Electronica", "Art numérique"],
    city: "Paris", region: "Île-de-France", stageLabel: "Performance audiovisuelle interactive",
    biography: "Noa transforme code, rythme et projection en performance visible. Chaque séquence est construite en direct et réagit à la salle.",
    audioTitle: "Prism Loop", roleId: "sound-designer",
  },
  {
    id: "nassim-halim", name: "Nassim Halim", gradeLevel: 3,
    image: "/images/tremplin/artists/generated/artist-modern-rai-singer-nassim-halim.webp",
    disciplines: ["Chanteur", "Auteur-compositeur"], styles: ["Raï moderne", "Électro-chaâbi", "Pop méditerranéenne"],
    city: "Marseille", region: "Provence-Alpes-Côte d'Azur", stageLabel: "Live méditerranéen en création",
    biography: "Nassim fait voyager le raï dans une production électronique ample et chaleureuse. Son nouveau live réunit synthés analogiques, percussions et chant frontal.",
    audioTitle: "Port d'Oran",
  },
  {
    id: "mara-shin", name: "Mara Shin", gradeLevel: 4,
    image: "/images/tremplin/artists/generated/artist-game-composer-mara-shin.webp",
    disciplines: ["Compositrice de jeux vidéo", "Sound designer"], styles: ["Orchestral électronique", "Ambient interactive", "Musique de jeu"],
    city: "Montreuil", region: "Île-de-France", stageLabel: "Bande originale interactive",
    biography: "Mara compose des univers adaptatifs où l'orchestration change avec les choix du joueur. Elle finalise la musique d'un premier jeu narratif indépendant.",
    audioTitle: "Second World",
  },
  {
    id: "rokh-ndao", name: "Rokh N'Dao", gradeLevel: 3,
    image: "/images/tremplin/artists/generated/artist-krump-dancer-rokh-ndao.webp",
    disciplines: ["Danseur", "Performer"], styles: ["Krump", "Danse urbaine", "Performance percussive"],
    city: "Saint-Étienne", region: "Auvergne-Rhône-Alpes", stageLabel: "Solo chorégraphique en résidence",
    biography: "Rokh transforme l'énergie du krump en narration scénique. Sa nouvelle pièce relie souffle, percussion corporelle et basses jouées en direct.",
    audioTitle: "Impact zéro",
  },
  {
    id: "velours-nord", name: "Velours Nord", gradeLevel: 4,
    image: "/images/tremplin/artists/generated/group-vocal-quartet-velours-nord.webp",
    disciplines: ["Quatuor vocal", "Chœur"], styles: ["Néo-soul vocale", "Jazz vocal", "A cappella contemporaine"],
    city: "Lille", region: "Hauts-de-France", stageLabel: "Création vocale à quatre voix",
    biography: "Velours Nord réunit quatre voix qui alternent textures a cappella, grooves néo-soul et improvisation. Le quartet prépare une série de concerts sans bande-son.",
    audioTitle: "Quatre souffles", roleId: "chanteuse-rappeuse",
  },
  {
    id: "maelle-keran", name: "Maëlle Keran", gradeLevel: 4,
    image: "/images/tremplin/artists/generated/artist-funk-trombonist-maelle-keran.webp",
    disciplines: ["Tromboniste", "Arrangeuse brass"], styles: ["Funk", "Brass groove", "Nu-jazz"],
    city: "Brest", region: "Bretagne", stageLabel: "Brass band en préproduction",
    biography: "Maëlle écrit des arrangements cuivrés massifs sans perdre le détail du groove. Son nouveau brass band relie funk côtier et nu-jazz.",
    audioTitle: "Cuivre salé",
  },
  {
    id: "alba-roche", name: "Alba Roche", gradeLevel: 3,
    image: "/images/tremplin/artists/generated/artist-folk-songwriter-alba-roche.webp",
    disciplines: ["Autrice-compositrice", "Guitariste"], styles: ["Indie folk", "Chamber folk", "Chanson acoustique"],
    city: "Annecy", region: "Auvergne-Rhône-Alpes", stageLabel: "Premier album acoustique",
    biography: "Alba écrit des chansons folk précises entourées de cordes et de prises de proximité. Elle enregistre un premier album entre bois, souffle et silence.",
    audioTitle: "Lac intérieur",
  },
  {
    id: "kima-voss", name: "Kima Voss", gradeLevel: 3,
    image: "/images/tremplin/artists/generated/kima-voss-chanteuse-punk-rock-nantes-v1.webp",
    disciplines: ["Chanteuse", "Guitariste"], styles: ["Punk alternatif", "Post-rock"],
    city: "Nantes", region: "Pays de la Loire", stageLabel: "Album abrasif en répétition",
    biography: "Kima porte un punk alternatif direct, traversé par des montées post-rock. Son trio prépare un album enregistré dans les conditions du concert.",
    audioTitle: "Morsure claire",
  },
  {
    id: "yacine-kermor", name: "Yacine Kermor", gradeLevel: 3,
    image: "/images/tremplin/artists/generated/yacine-kermor-accordeoniste-electro-clermont-ferrand-v1.webp",
    disciplines: ["Accordéoniste", "Producteur"], styles: ["Électro-folk", "Techno organique"],
    city: "Clermont-Ferrand", region: "Auvergne-Rhône-Alpes", stageLabel: "Bal électronique en création",
    biography: "Yacine détourne l'accordéon dans une techno organique construite pour la scène. Ses soufflets deviennent basses, accords et impulsions rythmiques.",
    audioTitle: "Soufflet volcanique",
  },
  {
    id: "nola-mbaye", name: "Nola M'Baye", gradeLevel: 4,
    image: "/images/tremplin/artists/generated/nola-mbaye-choriste-gospel-tours-v1.webp",
    disciplines: ["Choriste", "Directrice vocale"], styles: ["Gospel contemporain", "Soul"],
    city: "Tours", region: "Centre-Val de Loire", stageLabel: "Chœur soul en développement",
    biography: "Nola construit des harmonies gospel contemporaines pour des artistes soul et pop. Elle rassemble un chœur mobile capable de passer du studio à la scène.",
    audioTitle: "Higher Room", roleId: "chanteuse-rappeuse",
  },
  {
    id: "miko-reve", name: "Miko Rêve", gradeLevel: 3,
    image: "/images/tremplin/artists/generated/miko-reve-productrice-hyperpop-paris-v1.webp",
    disciplines: ["Productrice", "Autrice"], styles: ["Hyperpop", "Glitch-pop"],
    city: "Paris", region: "Île-de-France", stageLabel: "EP hyperpop en finition",
    biography: "Miko déforme voix, batteries et refrains pop jusqu'à produire une matière très physique. Son EP relie énergie numérique et textes intimes.",
    audioTitle: "Pixel tendre",
  },
  {
    id: "gael-ferran", name: "Gaël Ferran", gradeLevel: 4,
    image: "/images/tremplin/artists/generated/gael-ferran-guitariste-flamenco-jazz-perpignan-v1.webp",
    disciplines: ["Guitariste", "Compositeur"], styles: ["Flamenco-jazz", "Rumba contemporaine"],
    city: "Perpignan", region: "Occitanie", stageLabel: "Trio flamenco-jazz en studio",
    biography: "Gaël associe précision flamenca, liberté jazz et énergie de la rumba. Son trio prépare un disque sans frontière entre composition et improvisation.",
    audioTitle: "Ligne catalane",
  },
  {
    id: "kenza-loba", name: "Kenza Loba", gradeLevel: 4,
    image: "/images/tremplin/artists/generated/kenza-loba-dj-amapiano-aubervilliers-v1.webp",
    disciplines: ["DJ", "Productrice"], styles: ["Amapiano", "3-step afro-house"],
    city: "Aubervilliers", region: "Île-de-France", stageLabel: "Set club en résidence",
    biography: "Kenza construit des sets amapiano souples où log drums, voix fragmentées et 3-step s'enchaînent sans rupture. Sa résidence prépare une captation immersive.",
    audioTitle: "Canal Step",
  },
  {
    id: "milo-kanza", name: "Milo Kanza", gradeLevel: 4,
    image: "/images/tremplin/artists/generated/milo-kanza-double-bassist-dijon-v1.webp",
    disciplines: ["Contrebassiste", "Compositeur"], styles: ["Jazz contemporain", "Hard bop"],
    city: "Dijon", region: "Bourgogne-Franche-Comté", stageLabel: "Quartet jazz en résidence",
    biography: "Milo ancre un hard bop contemporain dans une contrebasse ample et très mélodique. Son quartet prépare un répertoire original pour clubs et festivals.",
    audioTitle: "Cave 21",
  },
  {
    id: "ilyes-pulse", name: "Ilyes Pulse", gradeLevel: 3,
    image: "/images/tremplin/artists/generated/ilyes-pulse-beatboxer-cergy-v1.webp",
    disciplines: ["Beatboxer", "Artiste de percussion vocale"], styles: ["Hip-hop beatbox", "Bass expérimentale"],
    city: "Cergy", region: "Île-de-France", stageLabel: "Solo vocal et loop station",
    biography: "Ilyes construit seul des architectures rythmiques à partir de la voix, du souffle et d'une loop station. Son nouveau set assume des basses très expérimentales.",
    audioTitle: "Mouth Circuit",
  },
  {
    id: "elise-kemba", name: "Élise Kemba", gradeLevel: 4,
    image: "/images/tremplin/artists/generated/elise-kemba-dub-producer-le-havre-v1.webp",
    disciplines: ["Productrice", "Ingénieure du son"], styles: ["Deep dub", "Bass music"],
    city: "Le Havre", region: "Normandie", stageLabel: "Live dub analogique",
    biography: "Élise sculpte un dub profond avec delays à bande, prises de terrain et basses physiques. Elle prépare un live entièrement manipulé depuis la console.",
    audioTitle: "Brume Channel", roleId: "ingenieur-son",
  },
  {
    id: "ewen-tran", name: "Éwen Tran", gradeLevel: 4,
    image: "/images/tremplin/artists/generated/ewen-tran-contemporary-harpist-angers-v1.webp",
    disciplines: ["Harpiste", "Compositeur"], styles: ["Minimalisme", "Électro-acoustique"],
    city: "Angers", region: "Pays de la Loire", stageLabel: "Pièce électro-acoustique",
    biography: "Éwen relie harpe de concert, microphones de contact et électronique minimale. Sa pièce explore la résonance comme une matière mouvante.",
    audioTitle: "Cordes lentes", roleId: "violoniste",
  },
  {
    id: "naya-oris", name: "Naya Oris", gradeLevel: 3,
    image: "/images/tremplin/artists/generated/naya-oris-boom-bap-rapper-grenoble-v1.webp",
    disciplines: ["Rappeuse", "Autrice"], styles: ["Boom-bap", "Hip-hop conscient"],
    city: "Grenoble", region: "Auvergne-Rhône-Alpes", stageLabel: "Album narratif en écriture",
    biography: "Naya défend un boom-bap précis, ancré dans le récit et l'observation sociale. Elle prépare un album construit comme une émission de radio nocturne.",
    audioTitle: "Fréquence Alpes",
  },
  {
    id: "lucien-aoki", name: "Lucien Aoki", gradeLevel: 5,
    image: "/images/tremplin/artists/generated/lucien-aoki-senior-mastering-engineer-reims-v1.webp",
    disciplines: ["Ingénieur mastering", "Conseiller sonore"], styles: ["Mastering analogique", "Musique acoustique haute résolution"],
    city: "Reims", region: "Grand Est", stageLabel: "Atelier mastering ouvert",
    biography: "Lucien accompagne des projets exigeants du pré-master à la livraison. Il ouvre son atelier à de jeunes équipes pour transmettre une écoute critique sans jargon.",
    audioTitle: "Reference A", roleId: "ingenieur-son",
  },
  {
    id: "jo-varenne", name: "Jo Varenne", gradeLevel: 5,
    image: "/images/tremplin/artists/generated/jo-varenne-blues-rock-guitar-toulouse-v1.webp",
    disciplines: ["Guitariste", "Chanteuse"], styles: ["Blues-rock", "Soul électrique"],
    city: "Toulouse", region: "Occitanie", stageLabel: "Nouvel album après trente ans de scène",
    biography: "Jo met trois décennies de scène au service d'un blues-rock sans nostalgie. Son prochain disque capte le grain de sa guitare et une voix devenue plus profonde avec le temps.",
    audioTitle: "Still Burning",
  },
  {
    id: "eliott-marek", name: "Eliott Marek", gradeLevel: 4,
    image: "/images/tremplin/artists/generated/eliott-marek-modular-producer-poitiers-v1.webp",
    disciplines: ["Producteur", "Live performer"], styles: ["Électronique modulaire", "Ambient rythmique"],
    city: "Poitiers", region: "Nouvelle-Aquitaine", stageLabel: "Live modulaire accessible en création",
    biography: "Eliott transforme ses synthétiseurs modulaires en instrument de scène tactile. Il conçoit un live immersif dont la scénographie reste accessible sans réduire l'ambition artistique.",
    audioTitle: "Patch Horizon",
  },
  {
    id: "moussa-elian", name: "Moussa Elian", gradeLevel: 4,
    image: "/images/tremplin/artists/generated/moussa-elian-blind-jazz-pianist-mulhouse-v2.webp",
    disciplines: ["Pianiste", "Compositeur"], styles: ["Jazz contemporain", "Soul instrumentale"],
    exactProfession: "Pianiste amateur · Jazz contemporain",
    city: "Mulhouse", region: "Grand Est", stageLabel: "Trio jazz en préproduction",
    biography: "Moussa compose au piano des thèmes qui laissent une grande place à l'écoute et à l'improvisation. Son trio prépare un répertoire où jazz contemporain et soul instrumentale se répondent.",
    audioTitle: "Inner Compass", roleId: "pianiste",
  },
  {
    id: "adrien-kora", name: "Adrien Kora", gradeLevel: 4,
    image: "/images/tremplin/artists/generated/adrien-kora-afro-jazz-saint-denis-v1.webp",
    disciplines: ["Joueur de kora", "Compositeur"], styles: ["Afro-jazz", "Musique mandingue contemporaine"],
    city: "Saint-Denis", region: "Île-de-France", stageLabel: "Ensemble afro-jazz en création",
    biography: "Adrien fait dialoguer la kora avec un quartet de jazz contemporain. Son nouveau répertoire préserve le grain acoustique de l'instrument tout en ouvrant de grands espaces d'improvisation.",
    audioTitle: "Vingt et une cordes", roleId: "violoniste",
  },
  {
    id: "salome-kit", name: "Salomé Kit", gradeLevel: 3,
    image: "/images/tremplin/artists/generated/salome-kit-math-rock-drummer-caen-v1.webp",
    disciplines: ["Batteuse", "Compositrice"], styles: ["Math-rock", "Rock instrumental"],
    city: "Caen", region: "Normandie", stageLabel: "Trio math-rock en répétition",
    biography: "Salomé compose depuis la batterie des morceaux précis mais jamais froids. Son trio travaille des signatures mouvantes, des ruptures franches et des mélodies très directes.",
    audioTitle: "Mesure impaire",
  },
  {
    id: "jonas-reef", name: "Jonas Reef", gradeLevel: 4,
    image: "/images/tremplin/artists/generated/artist-afrobeat-trumpeter-jonas-reef.webp",
    disciplines: ["Trompettiste", "Arrangeur de cuivres"], styles: ["Afrobeat", "Highlife contemporain", "Brass groove"],
    city: "Pointe-à-Pitre", region: "Guadeloupe", stageLabel: "Orchestre afrobeat en formation",
    biography: "Jonas écrit des sections de cuivres qui relient afrobeat, highlife et groove caribéen. Il rassemble un orchestre mobile pensé pour les scènes en plein air.",
    audioTitle: "Alizé Brass",
  },
  {
    id: "aya-miro", name: "Aya Miro", gradeLevel: 3,
    image: "/images/tremplin/artists/generated/artist-ambient-producer-aya-miro.webp",
    disciplines: ["Productrice ambient", "Field recordist"], styles: ["Ambient", "Électronique organique", "Soundscape"],
    city: "Limoges", region: "Nouvelle-Aquitaine", stageLabel: "Album de paysages sonores",
    biography: "Aya transforme des enregistrements de terrain en nappes vivantes, sans effacer leur origine. Son album suit une traversée sonore du plateau de Millevaches.",
    audioTitle: "Lichen mémoire",
  },
  {
    id: "robin-ciel", name: "Robin Ciel", gradeLevel: 4,
    image: "/images/tremplin/artists/generated/artist-drag-pop-robin-ciel.webp",
    disciplines: ["Artiste drag", "Chanteur"], styles: ["Art pop", "Électropop", "Performance vocale"],
    city: "Paris", region: "Île-de-France", stageLabel: "Show pop théâtral en création",
    biography: "Robin construit un show où voix live, costume et écriture pop racontent la même histoire. Le projet cherche une équipe lumière pour passer du club au théâtre.",
    audioTitle: "Ciel miroir",
  },
  {
    id: "camille-forge", name: "Camille Forge", gradeLevel: 4,
    image: "/images/tremplin/artists/generated/artist-luthier-experimental-guitarist-camille-forge.webp",
    disciplines: ["Luthière", "Guitariste expérimentale"], styles: ["Guitare expérimentale", "Ambient acoustique", "Électro-acoustique"],
    city: "Besançon", region: "Bourgogne-Franche-Comté", stageLabel: "Instruments augmentés en laboratoire",
    biography: "Camille fabrique puis joue ses propres guitares préparées. Son nouveau concert révèle les bruits mécaniques, résonances et accidents de chaque instrument.",
    audioTitle: "Bois conducteur",
  },
  {
    id: "louna-saphir", name: "Louna Saphir", gradeLevel: 4,
    image: "/images/tremplin/artists/generated/louna-saphir-violoncelliste-neo-classique-metz-v1.webp",
    disciplines: ["Violoncelliste", "Compositrice"], styles: ["Néo-classique", "Ambient chamber"],
    city: "Metz", region: "Grand Est", stageLabel: "Ensemble de chambre en création",
    biography: "Louna écrit pour violoncelle et petit ensemble en conservant une respiration très contemporaine. Elle prépare un concert où chaque pièce dialogue avec l'architecture du lieu.",
    audioTitle: "Verre et pierre",
  },
  {
    id: "samir-octave", name: "Samir Octave", gradeLevel: 4,
    image: "/images/tremplin/artists/generated/samir-octave-chanteur-funk-orleans-v1.webp",
    disciplines: ["Chanteur", "Auteur-compositeur"], styles: ["Funk contemporain", "Soul-funk"],
    city: "Orléans", region: "Centre-Val de Loire", stageLabel: "Show funk en répétition",
    biography: "Samir défend un funk contemporain porté par une voix chaude et une section rythmique très sèche. Son groupe prépare un spectacle pensé pour faire danser sans perdre les chansons.",
    audioTitle: "Octave chaude",
  },
  {
    id: "june-kairo", name: "June Kairo", gradeLevel: 3,
    image: "/images/tremplin/artists/generated/june-kairo-dj-drum-bass-amiens-v1.webp",
    disciplines: ["DJ", "Productrice"], styles: ["Drum & bass", "Bass music"],
    city: "Amiens", region: "Hauts-de-France", stageLabel: "Set bass en préparation",
    biography: "June enchaîne drum & bass nerveuse, bass music texturée et respirations atmosphériques. Elle prépare un set de festival avec une mise en lumière synchronisée.",
    audioTitle: "Somme Pressure",
  },
  {
    id: "aicha-sol", name: "Aïcha Sol", gradeLevel: 5,
    image: "/images/tremplin/artists/generated/aicha-sol-coach-vocal-gospel-nimes-v1.webp",
    disciplines: ["Coach vocal", "Directrice de chœur"], styles: ["Gospel contemporain", "Technique vocale soul"],
    city: "Nîmes", region: "Occitanie", stageLabel: "Programme vocal collectif",
    biography: "Aïcha accompagne les voix sans les standardiser. Son programme collectif aide chanteurs et choristes à construire endurance, couleur et présence scénique.",
    audioTitle: "Open Voice",
  },
  {
    id: "tiago-luz", name: "Tiago Luz", gradeLevel: 3,
    image: "/images/tremplin/artists/generated/tiago-luz-baile-funk-producer-bayonne-v1.webp",
    disciplines: ["Producteur", "DJ"], styles: ["Baile funk", "Atlantic bass"],
    city: "Bayonne", region: "Nouvelle-Aquitaine", stageLabel: "EP club transatlantique",
    biography: "Tiago croise percussions du baile funk, basses atlantiques et énergie des fêtes du Sud-Ouest. Son EP est pensé comme une montée continue de trente minutes.",
    audioTitle: "Pont Atlantique",
  },
  {
    id: "rania-vox", name: "Rania Vox", gradeLevel: 4,
    image: "/images/tremplin/artists/generated/rania-vox-lyric-electro-singer-avignon-v1.webp",
    disciplines: ["Chanteuse lyrique", "Compositrice"], styles: ["Lyrique-électro", "Art pop"],
    city: "Avignon", region: "Provence-Alpes-Côte d'Azur", stageLabel: "Performance voix et synthèse",
    biography: "Rania libère la voix lyrique de son cadre traditionnel pour la placer au cœur d'une art pop électronique. Elle prépare une forme scénique à la frontière du concert et du théâtre.",
    audioTitle: "Vox électrique",
  },
  {
    id: "lou-ardent", name: "Lou Ardent", gradeLevel: 3,
    image: "/images/tremplin/artists/generated/lou-ardent-theremin-composer-tours-v1.webp",
    disciplines: ["Théréministe", "Compositeurice"], styles: ["Musique expérimentale", "Électronique gestuelle"],
    city: "Tours", region: "Centre-Val de Loire", stageLabel: "Performance gestuelle en création",
    biography: "Lou joue le thérémine comme une chorégraphie sonore. Sa performance relie gestes, oscillateurs et silence dans une forme visuelle très épurée.",
    audioTitle: "Champ invisible",
  },
  {
    id: "zoe-marimba", name: "Zoé Marimba", gradeLevel: 4,
    image: "/images/tremplin/artists/generated/artist-contemporary-marimba-zoe-marimba.webp",
    disciplines: ["Percussionniste", "Compositrice"], styles: ["Marimba contemporain", "Musique minimaliste", "Néo-classique percussif"],
    city: "La Rochelle", region: "Nouvelle-Aquitaine", stageLabel: "Cycle pour marimba en création",
    biography: "Zoé construit des paysages harmoniques à partir du marimba, du silence et de motifs minimaux. Son nouveau cycle est pensé pour des lieux réverbérants.",
    audioTitle: "Lames d'écume",
  },
  {
    id: "bilal-dune", name: "Bilal Dune", gradeLevel: 4,
    image: "/images/tremplin/artists/generated/artist-tuareg-rock-singer-bilal-dune.webp",
    disciplines: ["Chanteur", "Guitariste"], styles: ["Rock touareg", "Desert blues contemporain", "Rock alternatif"],
    city: "Montreuil", region: "Île-de-France", stageLabel: "Groupe desert rock en studio",
    biography: "Bilal porte un rock touareg électrique où les boucles de guitare rencontrent une batterie alternative. Son groupe prépare un disque de route dense et hypnotique.",
    audioTitle: "Dune périphérique",
  },
  {
    id: "cleo-vent", name: "Cléo Vent", gradeLevel: 4,
    image: "/images/tremplin/artists/generated/artist-pop-choir-conductor-cleo-vent.webp",
    disciplines: ["Cheffe de chœur", "Arrangeuse vocale", "Autrice"], styles: ["Pop chorale", "Harmonies vocales contemporaines", "Chanson pop"],
    city: "Aix-en-Provence", region: "Provence-Alpes-Côte d'Azur", stageLabel: "Chœur pop en répétition",
    biography: "Cléo transforme des chansons pop en architectures vocales collectives. Son chœur prépare une série de concerts où les voix restent le seul instrument.",
    audioTitle: "Vent commun", roleId: "coach-vocal",
  },
  {
    id: "ana-vela", name: "Ana Vela", gradeLevel: 4,
    image: "/images/tremplin/artists/generated/ana-vela-electronic-tango-bandoneon-pau-v1.webp",
    disciplines: ["Bandonéoniste", "Compositrice"], styles: ["Tango électronique", "Néo-tango"],
    city: "Pau", region: "Nouvelle-Aquitaine", stageLabel: "Duo néo-tango en création",
    biography: "Ana fait respirer le bandonéon au milieu d'une électronique sombre et précise. Son duo compose un néo-tango pensé autant pour l'écoute que pour le mouvement.",
    audioTitle: "Pyrénées nocturnes", roleId: "accordeoniste",
  },
  {
    id: "oumar-lines", name: "Oumar Lines", gradeLevel: 4,
    image: "/images/tremplin/artists/generated/oumar-lines-reggae-bassist-fort-de-france-v1.webp",
    disciplines: ["Bassiste", "Compositeur"], styles: ["Reggae", "Dub caribéen"],
    city: "Fort-de-France", region: "Martinique", stageLabel: "Album reggae-dub en production",
    biography: "Oumar place la basse au centre d'un reggae caribéen spacieux et chaleureux. Son prochain album sera enregistré en live avec une section rythmique martiniquaise.",
    audioTitle: "Ligne Madinina",
  },
  {
    id: "sacha-bloom", name: "Sacha Bloom", gradeLevel: 4,
    image: "/images/tremplin/artists/generated/sacha-bloom-clarinettiste-jazz-klezmer-strasbourg-v1.webp",
    disciplines: ["Clarinettiste", "Compositeur"], styles: ["Jazz-klezmer contemporain", "Musique improvisée"],
    city: "Strasbourg", region: "Grand Est", stageLabel: "Trio jazz-klezmer en résidence",
    biography: "Sacha fait circuler la clarinette entre mélodies klezmer, improvisation contemporaine et pulsations de club. Son trio prépare un répertoire sans rupture entre danse et écoute.",
    audioTitle: "Bloom Passage",
  },
  {
    id: "mariam-delta", name: "Mariam Delta", gradeLevel: 4,
    image: "/images/tremplin/artists/generated/mariam-delta-productrice-gqom-roubaix-v1.webp",
    disciplines: ["Productrice", "Live performeuse"], styles: ["Gqom", "Afro-électronique industrielle"],
    city: "Roubaix", region: "Hauts-de-France", stageLabel: "Live gqom industriel",
    biography: "Mariam relie l'énergie sèche du gqom aux textures métalliques des anciennes filatures. Son live travaille la tension, l'espace et des percussions jouées en direct.",
    audioTitle: "Delta Textile",
  },
  {
    id: "hugo-quartz", name: "Hugo Quartz", gradeLevel: 3,
    image: "/images/tremplin/artists/generated/hugo-quartz-chanteur-shoegaze-le-mans-v1.webp",
    disciplines: ["Chanteur", "Guitariste"], styles: ["Shoegaze", "Dream pop"],
    exactProfession: "Chanteur & guitariste", roleId: "guitariste-electrique",
    city: "Le Mans", region: "Pays de la Loire", stageLabel: "Album shoegaze en préproduction",
    biography: "Hugo écrit des chansons simples qu'il enfouit sous des guitares larges et lumineuses. Son groupe cherche le point précis où le bruit laisse encore passer la voix.",
    audioTitle: "Quartz Haze",
  },
  {
    id: "tess-aoki", name: "Tess Aoki", gradeLevel: 4,
    image: "/images/tremplin/artists/generated/tess-aoki-music-video-director-vj-rennes-v1.webp",
    disciplines: ["Réalisatrice de clips", "VJ musicale"], styles: ["Arts audiovisuels", "VJing", "Scénographie live"],
    city: "Rennes", region: "Bretagne", stageLabel: "Live audiovisuel en développement",
    biography: "Tess conçoit l'image comme un instrument qui répond réellement à la musique. Elle développe un dispositif de VJing réactif pour accompagner artistes et groupes sur scène.",
    audioTitle: "Frame Sync",
  },
  {
    id: "minuit-label", name: "Minuit Label", gradeLevel: 4,
    image: "/images/tremplin/professions/minuit-label-ar-team-paris-v1.webp",
    disciplines: ["Label indépendant", "A&R", "Distribution"], styles: ["Pop alternative", "Rap francophone", "Électronique"],
    city: "Paris", region: "Île-de-France", stageLabel: "Promotion 2026 · trois projets accompagnés",
    biography: "Minuit Label accompagne des projets indépendants de la préproduction à la distribution. L'équipe publie ses critères, son calendrier et les moyens réellement engagés pour chaque signature.",
    audioTitle: "Session Minuit #04", roleId: "label",
    project: {
      headline: "Programme de développement de trois artistes",
      progressPercent: 72,
      nextMilestone: "Sélectionner le troisième projet de la promotion",
      supportNeed: "Un partenaire de diffusion pour une série de sessions filmées",
      proofPoints: ["2 artistes déjà contractualisés", "6 masters livrés", "Budget promotion verrouillé à 18 k€"],
    },
  },
  {
    id: "studio-echo-13", name: "Studio Écho 13", gradeLevel: 5,
    image: "/images/tremplin/professions/studio-echo-13-lyon-v1.webp",
    disciplines: ["Studio d'enregistrement", "Régie", "Résidence"], styles: ["Prise live", "Mixage hybride", "Résidence artistique"],
    city: "Lyon", region: "Auvergne-Rhône-Alpes", stageLabel: "Résidence pilote ouverte aux projets Tremplin",
    biography: "Écho 13 réunit une grande room, une régie hybride et une équipe permanente. Le studio documente les temps de travail, les livrables et le coût réel de chaque résidence.",
    audioTitle: "Room A · prise live", roleId: "studio-enregistrement",
    project: {
      headline: "Cycle de six résidences à tarif accompagné",
      progressPercent: 64,
      nextMilestone: "Accueillir la première résidence Tremplin en septembre",
      supportNeed: "Six projets prêts à enregistrer deux titres en conditions live",
      proofPoints: ["82 m² traités acoustiquement", "Ingénieure son permanente", "12 créneaux financés"],
    },
  },
  {
    id: "selma-keita-management", name: "Selma Keita", gradeLevel: 4,
    image: "/images/tremplin/professions/selma-keita-manager-marseille-v1.webp",
    disciplines: ["Management", "Stratégie de carrière", "Booking"], styles: ["Musique indépendante", "Développement d'artistes"],
    city: "Marseille", region: "Provence-Alpes-Côte d'Azur", stageLabel: "Tournée de 12 dates en construction",
    biography: "Selma structure les calendriers, budgets et négociations de trois artistes émergents. Chaque décision est reliée à un objectif de carrière et à un responsable identifié.",
    audioTitle: "Carnet de tournée", roleId: "management",
    project: {
      headline: "Première tournée interrégionale de Naya S.",
      progressPercent: 68,
      nextMilestone: "Confirmer les quatre dernières dates avant le 20 août",
      supportNeed: "Des relais de production à Lille, Nantes, Bordeaux et Toulouse",
      proofPoints: ["8 dates confirmées", "Budget prévisionnel équilibré", "Équipe technique constituée"],
    },
  },
  {
    id: "atelier-scene", name: "Atelier Scène", gradeLevel: 4,
    image: "/images/tremplin/professions/atelier-scene-live-crew-nantes-v1.webp",
    disciplines: ["Organisation scénique", "Scénographie", "Régie générale"], styles: ["Concert immersif", "Petites et moyennes scènes"],
    city: "Nantes", region: "Pays de la Loire", stageLabel: "Dispositif live modulaire en prototypage",
    biography: "Atelier Scène conçoit des dispositifs sobres, transportables et adaptés aux artistes émergents. La lumière, le son et les changements de plateau sont testés avant la première date.",
    audioTitle: "Conduite plateau #02", roleId: "organisation-scenique",
    project: {
      headline: "Scénographie modulaire pour salles de 200 à 600 places",
      progressPercent: 77,
      nextMilestone: "Tester le montage complet en moins de 90 minutes",
      supportNeed: "Un groupe et une danseuse pour la répétition technique filmée",
      proofPoints: ["3 configurations validées", "Montage actuel : 104 min", "Puissance limitée à 16 A"],
    },
  },
  {
    id: "nora-valen", name: "Nora Valen", gradeLevel: 4,
    image: "/images/tremplin/professions/nora-valen-art-director-lille-v1.webp",
    disciplines: ["Direction artistique", "Identité visuelle", "Narration de projet"], styles: ["Pop alternative", "R&B", "Culture visuelle"],
    city: "Lille", region: "Hauts-de-France", stageLabel: "Nouvelle identité d'EP en finalisation",
    biography: "Nora relie musique, image et discours pour éviter les univers plaqués. Son travail part des textes et des gestes de l'artiste avant de produire une direction visuelle exploitable.",
    audioTitle: "Moodboard sonore", roleId: "direction-artistique",
    project: {
      headline: "Univers complet du premier EP de Liora",
      progressPercent: 81,
      nextMilestone: "Valider la pochette et la grammaire des cinq contenus",
      supportNeed: "Une photographe éditoriale disponible deux jours à Lille",
      proofPoints: ["Narration des 5 titres validée", "Palette et typographies livrées", "Storyboard du clip approuvé"],
    },
  },
  {
    id: "agathe-lune", name: "Agathe Lune", gradeLevel: 3,
    image: "/images/tremplin/professions/agathe-lune-accordion-strasbourg-v1.webp",
    disciplines: ["Accordéoniste", "Compositrice"], styles: ["Néo-folk", "Électronique organique"],
    city: "Strasbourg", region: "Grand Est", stageLabel: "Duo accordéon et synthèse en résidence",
    biography: "Agathe fait dialoguer le souffle de l'accordéon avec une électronique minimale. Son duo construit un répertoire original loin des clichés associés à l'instrument.",
    audioTitle: "Souffle magnétique", roleId: "accordeoniste",
    project: {
      headline: "Set de 35 minutes accordéon et synthèse",
      progressPercent: 59,
      nextMilestone: "Finaliser deux transitions et une version sans click",
      supportNeed: "Un regard extérieur sur la dramaturgie du live",
      proofPoints: ["6 compositions terminées", "2 résidences effectuées", "Première captation publiée"],
    },
  },
  {
    id: "imani-cole", name: "Imani Cole", gradeLevel: 4,
    image: "/images/tremplin/professions/imani-cole-vocal-coach-bordeaux-v1.webp",
    disciplines: ["Coach vocal", "Préparation scénique"], styles: ["Soul", "Rap mélodique", "Pop"],
    city: "Bordeaux", region: "Nouvelle-Aquitaine", stageLabel: "Parcours voix & scène sur huit semaines",
    biography: "Imani accompagne les voix en respectant leur identité. Le programme suit l'endurance, la justesse en mouvement et la capacité à tenir un set complet, sans promesse artificielle.",
    audioTitle: "Échauffement 12 minutes", roleId: "coach-vocal",
    project: {
      headline: "Préparer quatre artistes à leur premier festival",
      progressPercent: 74,
      nextMilestone: "Réaliser les simulations de set complet",
      supportNeed: "Une salle équipée pour deux répétitions en conditions scène",
      proofPoints: ["24 séances réalisées", "4 diagnostics documentés", "Endurance moyenne : +18 min"],
    },
  },
  {
    id: "mael-nox", name: "Maël Nox", gradeLevel: 3,
    image: "/images/tremplin/professions/mael-nox-beatmaker-saint-denis-v1.webp",
    disciplines: ["Beatmaker", "Réalisateur musical"], styles: ["Hip-hop alternatif", "Jersey club", "Soul samplée"],
    city: "Saint-Denis", region: "Île-de-France", stageLabel: "Beat tape collaborative en finition",
    biography: "Maël produit des instrumentales nerveuses sans sacrifier l'espace pour les voix. Sa beat tape réunit six interprètes et documente chaque collaboration.",
    audioTitle: "Nox Tape · 03", roleId: "beatmaker",
    project: {
      headline: "Beat tape de huit titres et six collaborations",
      progressPercent: 79,
      nextMilestone: "Enregistrer les deux dernières voix invitées",
      supportNeed: "Un mixeur pour homogénéiser les huit productions",
      proofPoints: ["8 instrumentales validées", "4 voix enregistrées", "Clearance des samples vérifiée"],
    },
  },
  {
    id: "zora-madi", name: "Zora Madi", gradeLevel: 4,
    image: "/images/tremplin/professions/zora-madi-sound-engineer-toulouse-v1.webp",
    disciplines: ["Ingénieure du son", "Mixeuse", "Prise live"], styles: ["Jazz contemporain", "Rap", "Musiques acoustiques"],
    city: "Toulouse", region: "Occitanie", stageLabel: "Méthode de prise live compacte en test",
    biography: "Zora enregistre des ensembles dans des lieux qui n'ont pas été pensés comme des studios. Elle rend son dispositif, ses choix de micros et ses comparatifs accessibles aux artistes.",
    audioTitle: "Avant / après · Salle 4", roleId: "ingenieur-son",
    project: {
      headline: "Kit mobile pour enregistrer jusqu'à huit musiciens",
      progressPercent: 86,
      nextMilestone: "Valider le kit sur une section cuivres complète",
      supportNeed: "Un ensemble de six à huit musiciens pour la session test",
      proofPoints: ["3 lieux documentés", "Temps d'installation : 42 min", "Comparatifs bruts publiés"],
    },
  },
  {
    id: "sacha-moret", name: "Sacha Moret", gradeLevel: 3,
    image: "/images/tremplin/professions/sacha-moret-video-director-rennes-v1.webp",
    disciplines: ["Vidéaste clipper", "Réalisateur", "Monteur"], styles: ["Clip narratif", "Session live", "Documentaire musical"],
    city: "Rennes", region: "Bretagne", stageLabel: "Série de portraits d'artistes en préproduction",
    biography: "Sacha tourne léger pour conserver la vérité des lieux et des personnes. Sa nouvelle série mêle performance live et récit de fabrication dans un format court et identifiable.",
    audioTitle: "Repérages · Journal 01", roleId: "videaste-clipper",
    project: {
      headline: "Six portraits filmés de quatre minutes",
      progressPercent: 61,
      nextMilestone: "Tourner le pilote avec un duo rennais",
      supportNeed: "Un duo disponible une journée et un lieu avec lumière naturelle",
      proofPoints: ["Traitement éditorial validé", "Équipe de 3 personnes", "Budget pilote : 2 400 €"],
    },
  },
  {
    id: "lyes-kora", name: "Lyes Kora", gradeLevel: 3,
    image: "/images/tremplin/professions/lyes-kora-songwriter-montpellier-v1.webp",
    disciplines: ["Auteur", "Parolier", "Topliner"], styles: ["Chanson urbaine", "Pop francophone", "R&B"],
    city: "Montpellier", region: "Occitanie", stageLabel: "Atelier d'écriture interprojets",
    biography: "Lyes écrit au service de la voix et du vécu de chaque interprète. Il teste ses refrains en session, conserve les versions et rend les contributions lisibles.",
    audioTitle: "Deuxième couplet", roleId: "auteur-parolier",
    project: {
      headline: "Écrire quatre titres avec quatre interprètes",
      progressPercent: 67,
      nextMilestone: "Valider les textes en session voix",
      supportNeed: "Deux interprètes pop ou R&B pour compléter le cycle",
      proofPoints: ["2 textes finalisés", "4 toplines maquettées", "Crédits et splits documentés"],
    },
  },
  {
    id: "noham-faye", name: "Noham Faye", gradeLevel: 3,
    image: "/images/tremplin/professions/noham-faye-dancer-paris-v1.webp",
    disciplines: ["Danseur", "Chorégraphe"], styles: ["Danse contemporaine", "Krump", "Performance caméra"],
    city: "Paris", region: "Île-de-France", stageLabel: "Solo pour caméra en répétition",
    biography: "Noham compose pour le cadre autant que pour la scène. Son solo utilise les changements de distance, le souffle et une lumière très précise pour raconter la montée en tension.",
    audioTitle: "Respiration · prise 5", roleId: "danseur",
    project: {
      headline: "Solo chorégraphique de sept minutes",
      progressPercent: 76,
      nextMilestone: "Tourner une version continue avec lumière définitive",
      supportNeed: "Une directrice photo et un studio noir pendant une journée",
      proofPoints: ["Structure en 5 séquences", "3 répétitions filmées", "Musique originale livrée"],
    },
  },
  {
    id: "yuna-brass", name: "Yuna Brass", gradeLevel: 4,
    image: "/images/tremplin/professions/yuna-brass-trumpet-grenoble-v1.webp",
    disciplines: ["Trompettiste", "Arrangeuse de cuivres"], styles: ["Nu-jazz", "Afrobeat", "Hip-hop live"],
    city: "Grenoble", region: "Auvergne-Rhône-Alpes", stageLabel: "Section cuivres mobile en création",
    biography: "Yuna écrit des arrangements courts et percutants pour enrichir les concerts sans alourdir les tournées. Sa section mobile prépare trois formats adaptables.",
    audioTitle: "Brass Stack · 02", roleId: "instrumentiste-cuivre",
    project: {
      headline: "Trois packs d'arrangements pour artistes en tournée",
      progressPercent: 83,
      nextMilestone: "Tester le format trio sur un concert hip-hop",
      supportNeed: "Un artiste avec une date confirmée en octobre",
      proofPoints: ["12 arrangements livrés", "Trio constitué", "Rider technique réduit à une page"],
    },
  },
  {
    id: "camille-roe", name: "Camille Roe", gradeLevel: 4,
    image: "/images/tremplin/professions/camille-roe-music-producer-paris-v1.webp",
    disciplines: ["Productrice", "Compositrice", "Réalisatrice musicale"], styles: ["Art pop", "R&B alternatif", "Électronique"],
    city: "Paris", region: "Île-de-France", stageLabel: "Album d'artiste en réalisation",
    biography: "Camille accompagne les artistes de la maquette au master en conservant une méthode de décision très lisible. Chaque séance se termine par des choix, des responsables et une prochaine étape.",
    audioTitle: "Version 7 · refrain", roleId: "compositeur",
    project: {
      headline: "Réalisation d'un premier album de neuf titres",
      progressPercent: 71,
      nextMilestone: "Verrouiller les arrangements des titres 6 à 9",
      supportNeed: "Une bassiste et un batteur disponibles pour deux journées",
      proofPoints: ["5 titres produits", "Budget studio suivi", "Planning de livraison au 30 novembre"],
    },
  },
  ...danceRoster,
  ...pianoRoster,
  ...soundImageRoster,
  ...supportRoster,
] as const;

const generatedAudioSources = [
  "/media/preprofile-demo/hazy-after-hours.mp3",
  "/media/preprofile-demo/tech-house-vibes.mp3",
] as const;

function buildGeneratedWaveform(seedIndex: number) {
  return Array.from({ length: 56 }, (_, index) => {
    const signal = Math.sin((index + 1) * (0.31 + seedIndex * 0.013)) * 0.34;
    const pulse = Math.cos((index + seedIndex * 3) * 0.17) * 0.18;
    return Number(Math.max(0.12, Math.min(0.92, 0.46 + signal + pulse)).toFixed(2));
  });
}

function buildGeneratedMetrics(seed: GeneratedTremplinArtistSeed, index: number): readonly TremplinMetric[] {
  const baseAudience = 2_600 + index * 470;
  const community = 118 + index * 19;
  return [
    {
      id: `${seed.id}-audience`, family: "audience", title: "Une audience qui revient",
      indicator: `+${8 + index % 11} % d'auditeurs engagés`,
      explanation: "La part d'auditeurs qui reviennent écouter et interagir progresse sur la période.",
      values: [0, 1, 2, 3, 4, 5].map((step) => Math.round(baseAudience * (0.68 + step * 0.072 + (step % 2) * 0.018))),
    },
    {
      id: `${seed.id}-parcours`, family: "parcours", title: "Un parcours documenté",
      indicator: `${7 + index % 9} étapes publiées`,
      explanation: "Les sorties, répétitions et jalons sont partagés pour rendre le développement du projet lisible.",
      values: [2, 3, 4, 5, 6, 7].map((value) => value + index % 5),
    },
    {
      id: `${seed.id}-communaute`, family: "communaute", title: "Une communauté active",
      indicator: `${community} membres actifs`,
      explanation: "Le nombre de personnes qui suivent régulièrement le projet progresse sans présumer d'un résultat financier.",
      values: [0, 1, 2, 3, 4, 5].map((step) => Math.round(community * (0.54 + step * 0.09))),
    },
  ];
}

function createGeneratedArtist(seed: GeneratedTremplinArtistSeed, index: number): TremplinArtist {
  const communityBase = 148 + index * 23;
  return {
    id: seed.id,
    name: seed.name,
    gradeLevel: seed.gradeLevel ?? ([2, 3, 4][index % 3] as 2 | 3 | 4),
    portrait: seed.image,
    disciplines: seed.disciplines,
    exactProfession: seed.exactProfession ?? seed.disciplines[0],
    styles: seed.styles,
    city: seed.city,
    region: seed.region,
    stageLabel: seed.stageLabel,
    biography: seed.biography,
    accent: {
      primary: ["#8b5cff", "#6b7cff", "#c65bff", "#596dff"][index % 4],
      secondary: ["#526bff", "#9b6cff", "#714cff", "#8d72ff"][index % 4],
    },
    artwork: seed.image,
    community: {
      memberCount: communityBase,
      newMembers30Days: 18 + (index * 7) % 63,
    },
    audio: {
      title: seed.audioTitle,
      subtitle: `Extrait Tremplin · ${48 + index % 21} s`,
      durationLabel: `0:${String(48 + index % 12).padStart(2, "0")}`,
      audioSrc: generatedAudioSources[index % generatedAudioSources.length],
      waveform: buildGeneratedWaveform(index),
    },
    updates: [
      {
        id: `${seed.id}-u1`, dateLabel: `${3 + index % 17} juillet`,
        title: `${seed.stageLabel} · nouvelle étape`,
        summary: "Une nouvelle étape de création vient d'être partagée avec la communauté Tremplin.",
      },
      {
        id: `${seed.id}-u2`, dateLabel: `${18 + index % 8} juin`,
        title: "Carnet de création publié",
        summary: "L'artiste dévoile les choix artistiques et les personnes qui accompagnent le projet.",
      },
    ],
    metrics: buildGeneratedMetrics(seed, index),
    editorialSelection: index % 3 !== 1,
    ...(seed.isAiArtist ? { isAiArtist: true } : {}),
    ...(seed.roleId ? { roleId: seed.roleId } : {}),
    ...(seed.project ? { project: seed.project } : {}),
  };
}

// Keep the investor fixtures intact; the real Desktop catalogue cannot use them.
export const tremplinArtists: readonly TremplinArtist[] = getDesktopApplicationMode() === "live" ? [] : [
  ...coreTremplinArtists,
  ...generatedArtistSeeds.map(createGeneratedArtist),
];

export const tremplinStyles: readonly string[] = Array.from(
  new Set(tremplinArtists.flatMap((artist) => artist.styles)),
).sort((left, right) => left.localeCompare(right, "fr"));

export const tremplinRegions: readonly string[] = Array.from(
  new Set(tremplinArtists.map((artist) => artist.region)),
).sort((left, right) => left.localeCompare(right, "fr"));
