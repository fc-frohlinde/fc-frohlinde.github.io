# Flutlicht

> Die Team-App für Trainer und Spieler im Amateurfußball.

Anwesenheit, Aufstellungen, Trainingsplanung, Statistik und die Verbindung zu den Spielern in einer Anwendung – im Browser und als installierbare App.

🔗 **Live**: [fc-frohlinde.github.io](https://fc-frohlinde.github.io)

## Für Trainer

- 📋 **Anwesenheit** – Trainings und Spiele, Zu- und Absagen, Entschuldigungen, Status der Spieler (Probetraining, Pause, nicht mehr dabei)
- 👀 **Wer braucht Aufmerksamkeit?** – wer in Folge fehlt, seltener kommt, nach einer Pause zurück ist, wenig spielt
- ⚽ **Aufstellung und Saisonkader** – Formationen per Drag & Drop, Kader und Treffpunkt mit fertigem Text für die WhatsApp-Gruppe
- 🗒 **Trainingsplaner** – Abläufe, Übungsbibliothek, Rückblick nach dem Training
- 📝 **Spielbericht** – Startelf, Wechsel, Tore, Karten, Spielzeit
- 🎯 **Entwicklungsziele** und Notizen zum Gegner
- 📊 **Statistik und Wochenbericht**
- 📅 **Kalender** – auch als Abo für Google, Apple und Outlook

## Für Spieler

Jeder Spieler hat seinen eigenen Link: Zu- oder Absage, Belastung nach Training und Spiel, Spieler des Spiels, „Meine Karte“, Statistik und Wochenbericht. Spieler sehen ihre eigenen Daten – keine Notizen, Einschätzungen oder Kontaktdaten. Erinnerungen kommen als Push-Nachricht aufs Handy.

## Status

🧪 **Beta** – laufend weiterentwickelt, Version 1.2.x (November 2026).

## Aktueller Einsatz

Pilotverein: **FC Frohlinde 1949 e.V.** Name, Logo und Datenschutz-Kontakt sind Einstellungen des Vereins (Einstellungen → Verein) – die App selbst ist nicht an einen Verein gebunden.

## Technik

- Eine HTML/JavaScript-Datei, als Progressive Web App installierbar
- Firebase Realtime Database (Daten, Synchronisation in Echtzeit) und Firebase Authentication (Anmeldung mit Google oder E-Mail)
- Zugriff über Sicherheitsregeln: die Daten der Mannschaft nur für angemeldete Trainer, für jeden Spieler ein eigener Ausschnitt
- GitHub Actions: Erinnerungen (Web Push), tägliche verschlüsselte Sicherung, Test der Sicherheitsregeln
- Schriften auf der eigenen Seite; von außen geladen wird nur das Firebase-SDK
