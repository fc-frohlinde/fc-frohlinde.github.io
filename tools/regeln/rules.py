# Flutlicht · Firebase-Regeln. Writes database.rules.json (python3 rules.py).
# The expressions are built here once, so "is member" and "is admin" read the
# same everywhere. Publish: Firebase console → Realtime Database → Rules →
# paste database.rules.json → Publish. Tested by .github/workflows/regeln.yml.
import json

# A member: fcf_members/<uid> = {code, t, …}; access comes from the invite with
# that code — it must have been redeemed by this uid and not be revoked.
CODE = "root.child('fcf_members/'+auth.uid+'/code').val()"
INV = "root.child('fcf_invites/'+" + CODE + ")"
# The isString() check comes first: without a member entry the code is null,
# and 'fcf_invites/'+null is an error that fails the whole expression,
# including an "|| redeem" behind it (found by the emulator test).
IS_MEMBER = ("(auth != null && root.child('fcf_members/'+auth.uid+'/code').isString() && "
             + INV + ".child('used').val() === auth.uid && !"
             + INV + ".child('revoked').exists())")
IS_ADMIN = "(" + IS_MEMBER + " && " + INV + ".child('role').val() === 'admin')"

# Redeeming an invite: the member record and the invite's "used" are written in
# one update; each side checks the other in the new data.
NEW_CODE = "newData.child('code').val()"
OLD_INV = "root.child('fcf_invites/'+" + NEW_CODE + ")"
REDEEM_MEMBER = ("(auth != null && auth.uid === $uid && !data.exists() && newData.child('code').isString()"
                 " && " + OLD_INV + ".child('role').exists()"
                 " && !" + OLD_INV + ".child('used').exists()"
                 " && !" + OLD_INV + ".child('revoked').exists()"
                 " && " + OLD_INV + ".child('exp').val() > now"
                 " && newData.parent().parent().child('fcf_invites/'+" + NEW_CODE + "+'/used').val() === auth.uid)")
REDEEM_USED = ("(auth != null && !data.exists() && newData.val() === auth.uid"
               " && data.parent().child('role').exists()"
               " && data.parent().child('exp').val() > now"
               " && !data.parent().child('revoked').exists()"
               " && newData.parent().parent().parent().child('fcf_members/'+auth.uid+'/code').val() === $code)")
STR = lambda n: "newData.isString() && newData.val().length <= %d" % n

rules = {
  "rules": {
    "fcf_data": {
      ".read": True,
      ".write": "newData.exists() && newData.hasChild('version') && newData.child('version').val() >= 14",
      "version": {".validate": "newData.isNumber() && newData.val() >= 14 && newData.val() <= 999"},
      "teamList": {".validate": "newData.exists()"},
      "seasonList": {".validate": "newData.exists()"},
      "db": {".validate": "newData.exists()"},
      "_lastSaveTs": {".validate": "newData.isNumber() && newData.val() <= (now + 3600000)"},
      "_lastSaveBy": {".validate": "newData.isString() && newData.val().length <= 100"},
      "auditLogP": {"$id": {".validate": "newData.hasChildren(['ts','action']) && newData.child('ts').isNumber()"}},
      "auditLogT": {"$id": {".validate": "newData.hasChildren(['ts','action']) && newData.child('ts').isNumber()"}},
      "$other": {".validate": True}
    },
    "fcf_media": {
      ".read": True, ".write": True,
      "photos": {"$id": {".validate": "newData.isString() && newData.val().beginsWith('data:image') && newData.val().length <= 500000"}},
      "rev": {"$id": {".validate": "newData.isNumber() && newData.val() <= (now + 3600000)"}},
      "$other": {".validate": False}
    },
    "__backups": {
      ".read": True, ".write": True,
      "$index": {".validate": "newData.hasChildren(['ts','data'])"}
    },
    "__backups_meta": {
      ".read": True, ".write": True,
      "lastAutoDay": {".validate": "newData.isString() && newData.val().length <= 40"},
      "$other": {".validate": False}
    },
    "__presence": {
      ".read": True, ".write": True,
      "$sessionId": {
        ".validate": "newData.exists()",
        "lastSeen": {".validate": "newData.isNumber() && newData.val() <= (now + 3600000)"},
        "$other": {".validate": True}
      }
    },
    "__trainerActivity": {
      ".read": True, ".write": True,
      "$trainerKey": {
        ".validate": "newData.hasChildren(['name','lastSeen'])",
        "name": {".validate": "newData.isString() && newData.val().length <= 100"},
        "role": {".validate": "newData.isString() && newData.val().length <= 20"},
        "lastSeen": {".validate": "newData.isNumber() && newData.val() <= (now + 3600000)"},
        "team": {".validate": "newData.isString() && newData.val().length <= 60"},
        "season": {".validate": "newData.isString() && newData.val().length <= 20"},
        "viewing": {".validate": "newData.isString() && newData.val().length <= 100"},
        "appVersion": {".validate": "newData.isString() && newData.val().length <= 20"},
        "appTs": {".validate": "newData.isNumber()"},
        "$other": {".validate": True}
      }
    },
    "fcf_plans": {
      ".read": True, ".write": True,
      "$team": {
        "plans": {"$pid": {".validate": "newData.hasChild('upd')"}},
        "idx": {"$pid": {".validate": "newData.hasChild('upd')"}},
        "lib": {"$id": {".validate": "newData.hasChildren(['title','upd'])"}},
        "tpl": {"$id": {".validate": "newData.hasChildren(['name','upd'])"}},
        "meta": {".validate": "newData.hasChild('seeded')"},
        "$other": {".validate": False}
      }
    },
    "fcf_push": {
      "pub": {".read": True},
      "status": {".read": True},
      "config": {
        ".read": True,
        "$team": {
          ".write": True,
          "$kind": {".validate": "($kind === 'rpe' || $kind === 'vote' || $kind === 'rsvp') && newData.isBoolean()"}
        }
      },
      "subs": {
        "$owner": {
          ".read": True,
          "$device": {
            ".write": True,
            ".validate": "newData.hasChildren(['e','k','t']) && newData.child('e').isString() && newData.child('e').val().beginsWith('https://') && newData.child('e').val().length <= 1000 && newData.child('k/p256dh').isString() && newData.child('k/auth').isString() && newData.child('t').isNumber()"
          }
        }
      }
    },
    # ── Schritt B, Teil 1 (1.2.12): Konten und Einladungen ──
    # An invite is read by its code only (no list); admins make, change and
    # withdraw them. Anyone signed in can redeem a valid one once.
    "fcf_invites": {
      ".read": IS_ADMIN,
      "$code": {
        ".read": True,
        ".write": IS_ADMIN,
        ".validate": "newData.hasChildren(['role','name','t','exp'])",
        "role": {".validate": "newData.val() === 'admin' || newData.val() === 'trainer'"},
        "name": {".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 60"},
        "trainerId": {".validate": STR(40)},
        "t": {".validate": "newData.isNumber()"},
        "exp": {".validate": "newData.isNumber()"},
        "by": {".validate": STR(128)},
        "byName": {".validate": STR(60)},
        "used": {".write": REDEEM_USED, ".validate": STR(128)},
        "usedAt": {".write": "auth != null && !data.exists() && newData.parent().child('used').val() === auth.uid && !data.parent().child('used').exists()",
                   ".validate": "newData.isNumber() && newData.val() <= now + 60000"},
        "revoked": {".validate": "newData.isNumber()"},
        "$other": {".validate": False}
      }
    },
    # A member: who redeemed which invite. Written once by the member while
    # redeeming; afterwards only admins change or remove it.
    "fcf_members": {
      ".read": IS_ADMIN,
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": IS_ADMIN + " || " + REDEEM_MEMBER,
        ".validate": "newData.hasChildren(['code','t'])",
        "code": {".validate": "newData.isString() && newData.val().length >= 16 && newData.val().length <= 40"},
        "t": {".validate": "newData.isNumber() && newData.val() <= now + 60000"},
        "email": {".validate": STR(120)},
        "name": {".validate": STR(120)},
        "$other": {".validate": False}
      }
    },
    "$other": {".read": False, ".write": False}
  }
}
open('database.rules.json', 'w').write(json.dumps(rules, indent=2, ensure_ascii=False) + '\n')
print('written database.rules.json')
