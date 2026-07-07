package auth

var RoleDefaults = map[string]map[string]bool{
	"admin": {
		"dashboard.view":     true,
		"calendar.view":      true,
		"calendar.edit":      true,
		"cameras.view":       true,
		"sanders_cash.view":  true,
		"sanders_cash.award": true,
		"sanders_cash.redeem": true,
		"rewards.view":       true,
		"rewards.manage":     true,
		"rewards.redeem":     true,
		"rewards.resolve":    true,
		"chores.view":        true,
		"chores.manage":      true,
		"chores.complete":    true,
		"settings.view":      true,
		"settings.edit":      true,
		"family.manage":      true,
		"invites.manage":     true,
	},
	"parent": {
		"dashboard.view":     true,
		"calendar.view":      true,
		"calendar.edit":      true,
		"cameras.view":       true,
		"sanders_cash.view":  true,
		"sanders_cash.award": true,
		"sanders_cash.redeem": true,
		"rewards.view":       true,
		"rewards.manage":     true,
		"rewards.redeem":     true,
		"rewards.resolve":    true,
		"chores.view":        true,
		"chores.manage":      true,
		"chores.complete":    true,
		"settings.view":      true,
		"invites.manage":     true,
	},
	"kid": {
		"dashboard.view":     true,
		"calendar.view":      true,
		"sanders_cash.view":  true,
		"sanders_cash.redeem": true,
		"rewards.view":       true,
		"rewards.redeem":     true,
		"chores.view":        true,
		"chores.complete":    true,
	},
	"kiosk": {
		"dashboard.view":    true,
		"calendar.view":     true,
		"cameras.view":      true,
		"sanders_cash.view": true,
		"rewards.view":      true,
		"chores.view":       true,
	},
}

func HasPermission(user *UserInfo, perm string) bool {
	if user == nil {
		return false
	}
	if allowed, ok := user.Overrides[perm]; ok {
		return allowed
	}
	rolePerms, ok := RoleDefaults[user.Role]
	if !ok {
		return false
	}
	return rolePerms[perm]
}

func ResolvePermissions(role string, overrides map[string]bool) map[string]bool {
	result := make(map[string]bool)

	// Collect all known permission keys
	for _, perms := range RoleDefaults {
		for k := range perms {
			result[k] = false
		}
	}

	// Apply role defaults
	if rolePerms, ok := RoleDefaults[role]; ok {
		for k, v := range rolePerms {
			result[k] = v
		}
	}

	// Apply overrides
	for k, v := range overrides {
		result[k] = v
	}

	return result
}
