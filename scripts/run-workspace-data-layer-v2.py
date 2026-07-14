from __future__ import annotations

import runpy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_SCRIPT = ROOT / "scripts/refactor-workspace-data-layer.py"
SESSIONS_PATH = ROOT / "components/context/persisted-sessions.tsx"
PROJECTS_PATH = ROOT / "components/context/projects.tsx"


def fail(message: str) -> None:
    raise RuntimeError(message)


def replace_exact(
    text: str,
    old: str,
    new: str,
    label: str,
    expected_count: int = 1,
) -> str:
    actual = text.count(old)
    if actual != expected_count:
        fail(f"Expected {expected_count} {label}, found {actual}.")
    return text.replace(old, new, expected_count)


def prepare_source_script() -> None:
    text = SOURCE_SCRIPT.read_text(encoding="utf-8")
    regex_block = '''# Ref-aware setters now update their refs synchronously.
sessions = re.sub(
    r'(?m)^(\\s*)activeSessionRef\\.current = ([^\\n;]+);\\n\\1setActiveSession\\(\\2\\);',
    r'\\1setActiveSession(\\2);',
    sessions,
)
sessions = re.sub(
    r'(?m)^(\\s*)sessionsRef\\.current = ([^\\n;]+);\\n\\1setSessions\\(\\2\\);',
    r'\\1setSessions(\\2);',
    sessions,
)
'''
    text = replace_exact(
        text,
        regex_block,
        "",
        "early session ref cleanup block",
    )
    text = replace_exact(
        text,
        '''    const nextSessions = [data.session, ...sessionsRef.current];\\n    setSessions(nextSessions);\\n    setActiveSession(data.session);\\n''',
        '''    const nextSessions = [data.session, ...sessionsRef.current];\\n    sessionsRef.current = nextSessions;\\n    activeSessionRef.current = data.session;\\n    setSessions(nextSessions);\\n    setActiveSession(data.session);\\n''',
        "create-session transformation",
    )
    marker = 'SESSIONS_PATH.write_text(sessions, encoding="utf-8")\n'
    cleanup = '''# Ref-aware setters now update their refs synchronously.
sessions = re.sub(
    r'(?m)^(\\s*)activeSessionRef\\.current = ([^\\n;]+);\\n\\1setActiveSession\\(\\2\\);',
    r'\\1setActiveSession(\\2);',
    sessions,
)
sessions = re.sub(
    r'(?m)^(\\s*)sessionsRef\\.current = ([^\\n;]+);\\n\\1setSessions\\(\\2\\);',
    r'\\1setSessions(\\2);',
    sessions,
)
'''
    text = replace_exact(
        text,
        marker,
        cleanup + marker,
        "session write marker",
    )
    SOURCE_SCRIPT.write_text(text, encoding="utf-8")


def patch_hook_dependencies() -> None:
    sessions = SESSIONS_PATH.read_text(encoding="utf-8")
    session_replacements = [
        (
            "  }, [registerSessionConflict, userId]);",
            "  }, [registerSessionConflict, setActiveSession, userId]);",
            "loadSession dependency block",
        ),
        (
            "    return data.sessions;\n  }, []);",
            "    return data.sessions;\n  }, [setSessions]);",
            "refreshSessions dependency block",
        ),
        (
            "  }, [loadSession, refreshSessions, status, userId]);",
            "  }, [\n    activeSessionRef,\n    loadSession,\n    refreshSessions,\n    sessionsRef,\n    setActiveSession,\n    setSessions,\n    status,\n    userId,\n  ]);",
            "bootstrap dependency block",
        ),
        (
            "    setIsReady(true);\n  }, [userId]);\n\n  const archiveSession",
            "    setIsReady(true);\n  }, [prependSession, setActiveSession, userId]);\n\n  const archiveSession",
            "createSession dependency block",
        ),
        (
            "  }, [createSession, getKnownSession, loadSession, refreshSessions, registerSessionConflict, updateKnownSession]);",
            "  }, [\n    activeSessionRef,\n    createSession,\n    getKnownSession,\n    loadSession,\n    refreshSessions,\n    registerSessionConflict,\n    setActiveSession,\n    updateKnownSession,\n  ]);",
            "archiveSession dependency block",
        ),
        (
            "  }, [createSession, loadSession, refreshSessions, userId]);\n\n  const deleteSession",
            "  }, [\n    activeSessionRef,\n    createSession,\n    loadSession,\n    refreshSessions,\n    setActiveSession,\n    userId,\n  ]);\n\n  const deleteSession",
            "deleteSessions dependency block",
        ),
        (
            "  }, [createSession, loadSession, refreshSessions, userId]);\n\n  const renameSession",
            "  }, [\n    activeSessionRef,\n    createSession,\n    loadSession,\n    refreshSessions,\n    sessionsRef,\n    setActiveSession,\n    setSessions,\n    userId,\n  ]);\n\n  const renameSession",
            "recoverMissingSession dependency block",
        ),
        (
            "  }, [enqueueSessionSave, registerSessionConflict, updateKnownSession]);",
            "  }, [\n    activeSessionRef,\n    enqueueSessionSave,\n    registerSessionConflict,\n    updateKnownSession,\n  ]);",
            "saveActiveSessionDocumentPatch dependency block",
        ),
        (
            "  }, [updateKnownSession]);",
            "  }, [activeSessionRef, updateKnownSession]);",
            "loadLatestConflictVersion dependency block",
        ),
    ]
    for old, new, label in session_replacements:
        sessions = replace_exact(sessions, old, new, label)
    SESSIONS_PATH.write_text(sessions, encoding="utf-8")

    projects = PROJECTS_PATH.read_text(encoding="utf-8")
    project_replacements = [
        (
            "    return data.project;\n  }, [userId]);",
            "    return data.project;\n  }, [setActiveProject, userId]);",
            "loadProject dependency block",
        ),
        (
            "    return data.projects;\n  }, []);",
            "    return data.projects;\n  }, [setProjects]);",
            "refreshProjects dependency block",
        ),
        (
            "  }, [loadProject, refreshProjects, status, userId]);",
            "  }, [\n    loadProject,\n    refreshProjects,\n    setActiveProject,\n    setProjects,\n    status,\n    userId,\n  ]);",
            "projects bootstrap dependency block",
        ),
        (
            "  }, [userId]);\n\n  const selectProject",
            "  }, [setActiveProject, userId]);\n\n  const selectProject",
            "clearActiveProject dependency block",
        ),
        (
            "  }, [userId]);\n\n  const deleteProjects",
            "  }, [prependProject, setActiveProject, userId]);\n\n  const deleteProjects",
            "createProject dependency block",
        ),
        (
            "  }, [clearActiveProject, loadProject, refreshProjects, userId]);",
            "  }, [\n    activeProjectRef,\n    clearActiveProject,\n    loadProject,\n    refreshProjects,\n    setActiveProject,\n    userId,\n  ]);",
            "deleteProjects dependency block",
        ),
        (
            "    updateKnownProject(data.project);\n  }, []);",
            "    updateKnownProject(data.project);\n  }, [updateKnownProject]);",
            "renameProject dependency block",
        ),
        (
            "  }, [enqueueProjectPatch, updateKnownProject]);",
            "  }, [activeProjectRef, enqueueProjectPatch, updateKnownProject]);",
            "saveActiveProjectPatch dependency block",
        ),
        (
            "    return data.project;\n  }, []);\n\n  const removeActiveProjectMember",
            "    return data.project;\n  }, [activeProjectRef, updateKnownProject]);\n\n  const removeActiveProjectMember",
            "saveActiveProjectMember dependency block",
        ),
        (
            "    return data.project;\n  }, []);\n\n  const value",
            "    return data.project;\n  }, [activeProjectRef, updateKnownProject]);\n\n  const value",
            "removeActiveProjectMember dependency block",
        ),
    ]
    for old, new, label in project_replacements:
        projects = replace_exact(projects, old, new, label)
    PROJECTS_PATH.write_text(projects, encoding="utf-8")


def main() -> None:
    prepare_source_script()
    runpy.run_path(str(SOURCE_SCRIPT), run_name="__main__")
    patch_hook_dependencies()
    print("Workspace data layer v2 applied successfully.")


if __name__ == "__main__":
    main()
