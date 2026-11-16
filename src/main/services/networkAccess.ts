import { session, type Session } from 'electron'
import { isAllowedWebPermission } from '../../shared/networkAccess'

/**
 * Configure the Electron session so the IDE + preview iframe can use
 * localhost, LAN, and general internet — without enabling nodeIntegration.
 */
export function configureSessionNetworkAccess(target: Session = session.defaultSession): void {
  target.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(isAllowedWebPermission(permission))
  })

  target.setPermissionCheckHandler((_wc, permission) => isAllowedWebPermission(permission))
}
