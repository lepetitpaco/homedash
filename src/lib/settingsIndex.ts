/**
 * Ce que la recherche trouve dans les Réglages : une entrée par page et par réglage qu'on
 * cherche, avec les mots qu'on tape vraiment (synonymes compris). `section` est l'id d'une
 * partie de Réglages, `section:part` vise un sous-onglet (GitHub). Sans React, pour être testé.
 */
import type { Feature } from '../types'

export type SettingsEntry = {
  id: string
  icon: string
  /** Affiché « Réglages › {label} ». */
  label: string
  section: string
  keywords: string
  /** Absente quand cette fonctionnalité est coupée. */
  feature?: Feature
}

export const SETTINGS_INDEX: SettingsEntry[] = [
  { id: 'overview', icon: '🏠', label: "Vue d'ensemble", section: 'set-home', keywords: 'état connexions services résumé tout' },
  { id: 'features', icon: '🧩', label: 'Fonctionnalités', section: 'set-features', keywords: 'activer désactiver couper cacher onglets services' },
  { id: 'browser', icon: '🌐', label: 'Accès depuis le navigateur', section: 'set-features', keywords: 'localhost 7777 port navigateur web chrome safari' },
  { id: 'gh-account', icon: '🐙', label: 'GitHub › Compte', section: 'set-github:account', keywords: 'jeton token github connexion connecter compte pat', feature: 'github' },
  { id: 'gh-repos', icon: '🐙', label: 'GitHub › Repos suivis', section: 'set-github:repos', keywords: 'repos dépôts suivre suivis projets', feature: 'github' },
  { id: 'gh-team', icon: '👥', label: 'GitHub › Équipe', section: 'set-github:team', keywords: 'équipe collègues personnes utilisateurs moi', feature: 'github' },
  { id: 'gh-tab', icon: '🐙', label: "GitHub › Ce que montre l'onglet", section: 'set-github:tab', keywords: 'prs mergées rafraîchissement renovate cartes', feature: 'github' },
  { id: 'local', icon: '💻', label: 'Local', section: 'set-local', keywords: 'dépôts locaux dossiers code disque clones branches', feature: 'local' },
  { id: 'basecamp', icon: '🏕', label: 'Basecamp', section: 'set-basecamp', keywords: 'basecamp connecter tâches', feature: 'basecamp' },
  { id: 'bc-stats', icon: '📊', label: 'Basecamp › Stats en arrière-plan', section: 'set-basecamp', keywords: 'stats statistiques arrière-plan préparer qui a créé combien', feature: 'basecamp' },
  { id: 'bc-repos', icon: '🏕', label: 'Basecamp › Repos où créer les issues', section: 'set-basecamp', keywords: 'repos issues créer une issue github dépôts', feature: 'basecamp' },
  { id: 'trello', icon: '📋', label: 'Trello', section: 'set-trello', keywords: 'trello clé jeton cartes tableaux', feature: 'trello' },
  { id: 'tr-repos', icon: '📋', label: 'Trello › Repos où créer les issues', section: 'set-trello', keywords: 'repos issues créer une issue github dépôts', feature: 'trello' },
  { id: 'sites', icon: '🗂', label: 'Mes sites', section: 'set-tabs', keywords: 'sites onglets ajouter catalogue gmail' },
  { id: 'links', icon: '🔗', label: 'Mes sites › Liens qui ouvrent un nouvel onglet', section: 'set-tabs:more', keywords: 'liens lien ouvrir navigateur appli onglet clic externe' },
  { id: 'kept', icon: '📌', label: 'Mes sites › Onglets temporaires gardés', section: 'set-tabs:more', keywords: 'onglets temporaires gardés garder redémarrage' },
  { id: 'sleep', icon: '💤', label: 'Mes sites › Veille', section: 'set-tabs:more', keywords: 'veille mémoire endormir décharger' },
  { id: 'accounts', icon: '👤', label: 'Mes sites › Comptes', section: 'set-tabs', keywords: 'comptes plusieurs connexion session profil' },
  { id: 'folders', icon: '📁', label: 'Mes sites › Dossiers', section: 'set-tabs', keywords: 'dossiers ranger grouper' },
  { id: 'docker', icon: '🐳', label: 'Mes sites › Docker', section: 'set-tabs:docker', keywords: 'docker containers compose ports' },
  { id: 'extensions', icon: '🧩', label: 'Mes sites › Extensions', section: 'set-tabs:extensions', keywords: 'extensions navigateur chrome content script bc layout anilist manifest' },
  { id: 'bars', icon: '🧭', label: 'Barres et onglets', section: 'set-bars', keywords: 'disposition barre gauche onglets en haut pastilles soulignés masquer cacher taille icônes' },
  { id: 'display', icon: '🎛', label: 'Affichage', section: 'set-display', keywords: 'largeur page centrée colonnes densité tuiles horloge voyants écran icônes des sites favicons pour commencer' },
  { id: 'notifs', icon: '🔔', label: 'Notifications', section: 'set-notifs', keywords: 'notifications bureau alertes compteur icône dock sourdine' },
  { id: 'bell-kinds', icon: '🔕', label: 'Notifications › Ce qui compte dans la cloche', section: 'set-notifs', keywords: 'cloche trop de notifications types renovate ci discret masquer compteur bruit' },
  { id: 'backups', icon: '💾', label: 'Sauvegardes', section: 'set-backups', keywords: 'sauvegarde restaurer backup export importer autre machine' },
  { id: 'guide', icon: '📖', label: 'Guide', section: 'help-guide', keywords: 'aide guide comment faire documentation raccourcis clavier' },
  { id: 'diag', icon: '🩺', label: 'Diagnostic', section: 'help-diag', keywords: 'erreurs journal performance lenteur bug mémoire' },
  { id: 'news', icon: '📜', label: 'Nouveautés', section: 'help-news', keywords: 'version mise à jour changelog nouveautés' },
]

/** Les entrées visibles : sans celles des fonctionnalités coupées. */
export function settingsEntries(on: Partial<Record<Feature, boolean>>): SettingsEntry[] {
  return SETTINGS_INDEX.filter((e) => !e.feature || on[e.feature] !== false)
}
