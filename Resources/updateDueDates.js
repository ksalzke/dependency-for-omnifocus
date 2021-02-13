/* global PlugIn */
(() => {
  const action = new PlugIn.Action(function (selection, sender) {
    // config
    const config = this.dependencyConfig
    const prereqTag = config.prerequisiteTag()

    const dependencyLibrary = this.dependencyLibrary

    prereqTag.remainingTasks.forEach((task) => {
      // for each remaining task tagged as a prerequisite...

      // get dependant tasks
      const dependentTasks = dependencyLibrary.getDependants(task)

      // find earliest due date
      let earliestDue = null
      dependentTasks.forEach((dep) => {
        if (dep.effectiveDueDate < earliestDue || earliestDue == null) {
          earliestDue = dep.effectiveDueDate
        }
      })

      if (
        (earliestDue < task.effectiveDueDate && earliestDue !== null) ||
        task.effectiveDueDate == null
      ) {
        // if earlier than task's current effective due date, use earlier date
        task.dueDate = earliestDue
        // if prerequisite task is part of a sequential action group/project, also update due date of preceding actions
        if (task.parent !== null && task.parent.sequential) {
          const siblings = task.parent.children
          for (let i = 0; i < siblings.length; i++) {
            const sibling = siblings[i]
            if (sibling !== task) {
              sibling.dueDate = earliestDue
            } else break
          }
        }
      }
    })
  })

  action.validate = function (selection, sender) {
    // only valid if nothing is selected - so does not show in share menu
    return selection.tasks.length === 0 && selection.projects.length === 0
  }

  return action
})()