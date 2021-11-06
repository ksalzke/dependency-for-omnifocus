/* global PlugIn Version Project Alert Tag Task */
(() => {
  const dependencyLibrary = new PlugIn.Library(new Version('1.0'))

  dependencyLibrary.loadSyncedPrefs = () => {
    const syncedPrefsPlugin = PlugIn.find('com.KaitlinSalzke.SyncedPrefLibrary')

    if (syncedPrefsPlugin !== null) {
      const SyncedPref = syncedPrefsPlugin.library('syncedPrefLibrary').SyncedPref
      return new SyncedPref('com.KaitlinSalzke.DependencyForOmniFocus')
    } else {
      const alert = new Alert(
        'Synced Preferences Library Required',
        'For the Dependency plug-in to work correctly, the \'Synced Preferences for OmniFocus\' plugin(https://github.com/ksalzke/synced-preferences-for-omnifocus) is also required and needs to be added to the plug-in folder separately. Either you do not currently have this plugin installed, or it is not installed correctly.'
      )
      alert.show()
    }
  }

  dependencyLibrary.getLinks = () => {
    const syncedPrefs = dependencyLibrary.loadSyncedPrefs()
    return syncedPrefs.read('links') || []
  }

  dependencyLibrary.addDependancy = async (prereq, dep) => {
    const syncedPrefs = dependencyLibrary.loadSyncedPrefs()
    const links = dependencyLibrary.getLinks()
    const prerequisiteTag = await dependencyLibrary.getPrefTag('prerequisiteTag')
    const dependantTag = await dependencyLibrary.getPrefTag('dependantTag')
    const markerTag = await dependencyLibrary.getPrefTag('markerTag')

    // add tags
    dep.addTag(dependantTag)
    prereq.addTag(prerequisiteTag)

    // if dependant is project, set to on hold
    if (dep.project !== null) dep.project.status = Project.Status.OnHold

    // prepend prerequisite details to notes
    dep.note = `[ PREREQUISITE: omnifocus:///task/${prereq.id.primaryKey} ] ${prereq.name}\n\n${dep.note}`
    prereq.note = `[ DEPENDANT: omnifocus:///task/${dep.id.primaryKey} ] ${dep.name}\n\n${prereq.note}`

    // save link in synced prefs
    links.push([prereq.id.primaryKey, dep.id.primaryKey])
    syncedPrefs.write('links', links)

    // if dependant task has children:
    if (dep.hasChildren && dep.sequential) dependencyLibrary.addDependency(dep.children[0])
    if (dep.hasChildren && !dep.sequential) dep.children.forEach(child => dependencyLibrary.addDependancy(child, prereq))

    // remove marker tag used for processing
    prereq.removeTag(markerTag)
  }

  dependencyLibrary.removeDependancy = async (prereqID, depID) => {
    const dependantTag = await dependencyLibrary.getPrefTag('dependantTag')
    const prerequisiteTag = await dependencyLibrary.getPrefTag('prerequisiteTag')
    const prereq = Task.byIdentifier(prereqID)
    const dep = Task.byIdentifier(depID)

    // remove link from prefs
    const syncedPrefs = dependencyLibrary.loadSyncedPrefs()
    const links = dependencyLibrary.getLinks()
    const updated = links.filter(link => !(link[0] === prereqID && link[1] === depID))
    syncedPrefs.write('links', updated)

    // update prereq task if it still exists
    if (prereq !== null) {
      // remove dep from prereq note
      const regexString1 = `[ ?DEPENDANT: omnifocus:///task/${depID} ?].+`
      RegExp.quote = (str) => str.replace(/([*^$[\]\\(){}|-])/g, '\\$1')
      const regexForNoteSearch1 = new RegExp(RegExp.quote(regexString1))
      prereq.note = prereq.note.replace(regexForNoteSearch1, '')

      // if no remaining dependancies, remove tag from prereq task
      const deps = await dependencyLibrary.getDependants(prereq)
      if (deps.length === 0) {
        prereq.removeTag(prerequisiteTag)
      }
    }

    // update dep task if it still exists
    if (dep !== null) {
      // remove prereq from dep note
      const regexString2 = `[ ?PREREQUISITE: omnifocus:///task/${prereqID} ?].+`
      RegExp.quote = (str) => str.replace(/([*^$[\]\\(){}|-])/g, '\\$1')
      const regexForNoteSearch2 = new RegExp(RegExp.quote(regexString2))
      dep.note = dep.note.replace(regexForNoteSearch2, '')

      // if no remaining prerequisites, remove tag from dependant task (and if project set to active)
      const prereqs = await dependencyLibrary.getPrereqs(dep)
      if (prereqs.length === 0) {
        dep.removeTag(dependantTag)
        if (dep.project !== null) dep.project.status = Project.Status.Active
      }

      // if dep has children also run on those
      if (dep.hasChildren && dep.sequential) dependencyLibrary.removeDependancy(dep.children[0], prereq)
      else if (dep.hasChildren) dep.children.forEach(child => dependencyLibrary.removeDependancy(child, prereq))
    }
  }

  dependencyLibrary.getPrefTag = async (prefTag) => {
    const preferences = dependencyLibrary.loadSyncedPrefs()
    const tagID = preferences.readString(`${prefTag}ID`)

    if (tagID !== null) return Tag.byIdentifier(tagID)

    // if not set, show preferences pane and then try again
    await this.action('preferences').perform()
    return dependencyLibrary.getPrefTag(prefTag)
  }

  dependencyLibrary.getDependants = (task) => {
    const links = dependencyLibrary.getLinks()
    return links.filter(link => link[0] === task.id.primaryKey).map(link => Task.byIdentifier(link[1]))
  }

  dependencyLibrary.getPrereqs = async (task) => {
    const links = dependencyLibrary.getLinks()
    return links.filter(link => link[1] === task.id.primaryKey).map(link => Task.byIdentifier(link[0]))
  }

  dependencyLibrary.updateDependancies = () => {
    // remove any links where one of the tasks does not exist
    const links = dependencyLibrary.getLinks()

    // get links where one or both of the values has been completed, dropped, or no longer exists
    const linksToRemove = links.filter(link => {
      const [prereqID, depID] = link
      const [prereq, dep] = [Task.byIdentifier(prereqID), Task.byIdentifier(depID)]

      return prereq === null || dep === null || prereq.taskStatus === Task.Status.Completed || prereq.taskStatus === Task.Status.Dropped || dep.taskStatus === Task.Status.Completed || dep.taskStatus === Task.Status.Dropped
    })

    linksToRemove.forEach(link => dependencyLibrary.removeDependancy(link[0], link[1]))
  }

  return dependencyLibrary
})()
