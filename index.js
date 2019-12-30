import React from 'react'
import { Route, Redirect } from 'react-router-dom'
import PropTypes from 'prop-types'
import { AnimatedSwitch } from 'react-router-transition'
import querystring from 'querystring'
const localMemory = {}

function RouteComponentContainerWrapper (props) {
  const auth = true
  const { children, requiredAuth } = props

  if (!requiredAuth) {
    return children
  }

  if (auth === true) {
    return children
  }

  return React.createElement(Redirect, {
    to: `/login?redirect=${window.location.href.split(window.location.host)[1]}`
  })
}

RouteComponentContainerWrapper.propTypes = {
  children: PropTypes.node,
  requiredAuth: PropTypes.bool
}

function isUndefinedThen (prop, value) {
  return prop === undefined ? value : prop
}

function RouteWithSubRoutes (route) {
  if (route.redirect) {
    return React.createElement(Route, {
      exact: isUndefinedThen(route.exact, true),
      path: route.path,
      strict: isUndefinedThen(route.strict, false),
      render: () => React.createElement(Redirect, {
        to: route.redirect
      })
    })
  }

  const render = routerProps => React.createElement(RouteComponentContainerWrapper, {
    requiredAuth: route.auth || false,
    children: React.createElement(route.component, routerProps)
  })

  const routeProps = {
    render
  }

  return React.createElement(Route, routeProps)
}

function bestCopyEver (src) {
  return Object.assign({}, src)
}

const pathUtils = {
  append (target, path, between = '/') {
    return target + between + path
  },
  setParams (target, params) {
    for (const param in params) {
      target = target.replace(RegExp(`:${param}`, 'g'), params[param])
    }

    return target
  },
  setQueries (target, queries) {
    return target + '?' + querystring.encode(queries)
  }
}

function viewGenerator (target, basePath, key, parents) {
  const reg = '([.A-Za-z0-9_-]*)'
  const view = bestCopyEver(target)

  if (view.path) {
    view.pathRegex = basePath + view.path.replace(RegExp(':' + reg, 'g'), reg) + '$'

    view.getPath = function () {
      return basePath + view.path
    }

    view.appendPath = function (path, between = '/') {
      return pathUtils.append(view.getPath(), path, between)
    }

    view.setParams = function (params) {
      return pathUtils.setParams(view.getPath(), params)
    }

    view.setQueryParams = function (queries) {
      return pathUtils.setQueries(view.getPath(), queries)
    }

    view.handlerPath = function (options) {
      let path = view.getPath()

      if (options.params) {
        path = pathUtils.setParams(path, options.params)
      }

      if (options.append) {
        path = pathUtils.append(path, options.append)
      }

      if (options.queries) {
        path = pathUtils.setQueries(path, options.queries)
      }

      return path
    }
  }

  view.parents = parents

  if (!view.title) {
    view.title = key.charAt(0).toUpperCase() + key.slice(1)
  }

  return viewFormation(view)
}

function routeGenerator (target, basePath) {
  const reg = '([.A-Za-z0-9_-]*)'
  const route = bestCopyEver(target)

  if (route.path) {
    route.path = basePath + route.path
    route.pathRegex = route.path.replace(RegExp(':' + reg, 'g'), reg) + '$'
  }

  if (route.children) {
    delete route.children
  }

  return route
}

function resolveBasePath (path) {
  return path.slice(0, -1) + path[path.length - 1].replace('/', '')
}

export function handlerRoutes (targetRoutes, basePath = '', parents = []) {
  console.log('handlerRoutes', 'basePath', basePath)
  const routes = []
  const views = {}
  const viewsList = []

  for (const key in targetRoutes) {
    const target = targetRoutes[key]
    const route = routeGenerator(target, basePath)
    views[key] = viewGenerator(target, basePath, key, parents)

    routes.push(route)
    viewsList.push(views[key])

    if (target.children) {
      const children = handlerRoutes(target.children, resolveBasePath(route.path), [...parents, views[key]])
      routes.push(...children.routes)
      viewsList.push(...children.viewsList)
      views[key].children = children.views
    }
  }

  return {
    routes,
    views,
    tree: targetRoutes,
    viewsList,
    getCurrentView () {
      const currentView = viewsList.filter(view => {
        return RegExp(view.pathRegex).test(window.location.pathname)
      })
      return currentView ? currentView[0] : null
    }
  }
}

function viewFormation (target) {
  return new Proxy(target, {
    get: function (view, name) {
      if (!view[name] && view.children && view.children[name]) {
        return view.children[name]
      }

      return view[name]
    }
  })
}

function defaultReactRouterProps (route) {
  return {
    ...route,
    exact: isUndefinedThen(route.sensitive, true),
    sensitive: isUndefinedThen(route.sensitive, true),
    strict: isUndefinedThen(route.sensitive, false)
  }
}

export function WrapperRouter ({ routes, animate }) {
  console.log('allRoutes', routes)
  const children = routes.map((route, key) => React.createElement(RouteWithSubRoutes, {
    key,
    ...defaultReactRouterProps(route)
  }))

  if (animate) {
    return React.createElement(AnimatedSwitch, {
      atEnter: { opacity: 0 },
      atLeave: { opacity: 0 },
      atActive: { opacity: 1 },
      className: 'switch-wrapper',
      children
    })
  }

  return React.createElement(React.Fragment, {
    children
  })
}

WrapperRouter.defaultProps = {
  animate: false
}

WrapperRouter.propTypes = {
  routes: PropTypes.any,
  animate: PropTypes.bool
}

export function createRoutes (groupName, routesParams) {
  const routes = handlerRoutes(routesParams)

  localMemory[groupName] = routes

  return localMemory
}

export function Routes (props) {
  const { group, routes, ...other } = props

  const localRoutes = routes || localMemory[group]

  return React.createElement(WrapperRouter, {
    ...localRoutes,
    ...other
  })
}

Routes.propTypes = {
  group: PropTypes.string,
  routes: PropTypes.object
}

export * from 'react-router-dom'
