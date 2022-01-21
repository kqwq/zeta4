import fetch from "node-fetch"

let internalApi = `https://www.khanacademy.org/api/internal`

let map = {
  "badges": {
    type: "fetch",
    params: ["username"],
    api: (smartUsername) => {
      let paramName = smartUsername.startsWith("kaid_") ? "kaid" : "username"
      return {
        url: `${internalApi}/user/badges?${paramName}=${smartUsername}`,
      }
    },
  },

  "profile": {
    type: "graphql",
    params: ["username"],
    api: (smartUsername) => {
      let paramName = smartUsername.startsWith("kaid_") ? "kaid" : "username"
      return {
        url: "https://www.khanacademy.org/api/internal/graphql/getFullUserProfile",
        body: `{\"operationName\":\"getFullUserProfile\",\"variables\":{\"${paramName}\":\"${smartUsername}\"},\"query\":\"query getFullUserProfile($kaid: String, $username: String) {\\n  user(kaid: $kaid, username: $username) {\\n    id\\n    kaid\\n    key\\n    userId\\n    email\\n    username\\n    profileRoot\\n    gaUserId\\n    qualarooId\\n    isPhantom\\n    isDeveloper: hasPermission(name: \\\"can_do_what_only_admins_can_do\\\")\\n    isCurator: hasPermission(name: \\\"can_curate_tags\\\", scope: ANY_ON_CURRENT_LOCALE)\\n    isCreator: hasPermission(name: \\\"has_creator_role\\\", scope: ANY_ON_CURRENT_LOCALE)\\n    isPublisher: hasPermission(name: \\\"can_publish\\\", scope: ANY_ON_CURRENT_LOCALE)\\n    isModerator: hasPermission(name: \\\"can_moderate_users\\\", scope: GLOBAL)\\n    isParent\\n    isSatStudent\\n    isTeacher\\n    isDataCollectible\\n    isChild\\n    isOrphan\\n    isCoachingLoggedInUser\\n    canModifyCoaches\\n    nickname\\n    hideVisual\\n    joined\\n    points\\n    countVideosCompleted\\n    bio\\n    soundOn\\n    muteVideos\\n    showCaptions\\n    prefersReducedMotion\\n    noColorInVideos\\n    autocontinueOn\\n    newNotificationCount\\n    canHellban: hasPermission(name: \\\"can_ban_users\\\", scope: GLOBAL)\\n    canMessageUsers: hasPermission(name: \\\"can_send_moderator_messages\\\", scope: GLOBAL)\\n    isSelf: isActor\\n    hasStudents: hasCoachees\\n    hasClasses\\n    hasChildren\\n    hasCoach\\n    badgeCounts\\n    homepageUrl\\n    isMidsignupPhantom\\n    includesDistrictOwnedData\\n    canAccessDistrictsHomepage\\n    preferredKaLocale {\\n      id\\n      kaLocale\\n      status\\n      __typename\\n    }\\n    underAgeGate {\\n      parentEmail\\n      daysUntilCutoff\\n      approvalGivenAt\\n      __typename\\n    }\\n    authEmails\\n    signupDataIfUnverified {\\n      email\\n      emailBounced\\n      __typename\\n    }\\n    pendingEmailVerifications {\\n      email\\n      unverifiedAuthEmailToken\\n      __typename\\n    }\\n    tosAccepted\\n    shouldShowAgeCheck\\n    __typename\\n  }\\n  actorIsImpersonatingUser\\n}\\n\"}`,
      }
    }
  },

  "avatarDataForProfile": {
    type: "graphql",
    params: ["kaid"],
    api: (kaid) => {
      return {
        url: "https://www.khanacademy.org/api/internal/graphql/avatarDataForProfile",
        body: `{\"operationName\":\"avatarDataForProfile\",\"variables\":{\"kaid\":\"${kaid}\"},\"query\":\"query avatarDataForProfile($kaid: String!) {\\n  user(kaid: $kaid) {\\n    id\\n    avatar {\\n      name\\n      imageSrc\\n      __typename\\n    }\\n    __typename\\n  }\\n}\\n\"}`,
      }
    }
  },
};

/**
 * A very non-RESTful proxy API.
 * @param {string} route 
 * @param {string | string[]} params 
 * @returns Your standard fetch() promise object.
 */
async function fetchProxy(route, params) {
  let routeInfo = map[route]
  if (!routeInfo) {
    // Return a 404
    return {
      status: 404,
      statusText: "Not Found",
      json: () => {
        return {
          error: "Route not found",
        }
      },
      text: () => {
        return "Route not found"
      }
    }
  }

  if (!Array.isArray(params)) {
    params = [params]
  }

  let response
  if (routeInfo.type === "fetch") {
    response = await fetch(routeInfo.api(...params).url)
  } else if (routeInfo.type === "graphql") {
    response = await fetch(routeInfo.api(...params).url, {
      method: "POST",
      body: routeInfo.api(...params).body,
      headers: {
        "Content-Type": "application/json",
      },
    })
  }
  return response
}


// // Test case
// (async () => {
//   let response = await fetchProxy("profile", "peterwcollingridge")
//   let a = await response.json()
//   console.log(a)
//   let kaid = a.data.user.id
//   response = await fetchProxy("avatarDataForProfile", kaid)
//   let json = await response.json()
//   console.log(json)
// })()

export { fetchProxy }